import Foundation
import AVFoundation
import CoreMedia
import ScreenCaptureKit

enum CaptureSource: String {
  case mic
  case system
}

struct CaptureArguments {
  let sessionId: String
  let micDeviceId: String
  let includeSystemAudio: Bool
  let chunkDurationMs: Int

  static func parse() throws -> CaptureArguments {
    var sessionId = ""
    var micDeviceId = "default"
    var includeSystemAudio = true
    var chunkDurationMs = 500

    let args = Array(CommandLine.arguments.dropFirst())
    var index = 0
    while index < args.count {
      let key = args[index]
      let next = index + 1 < args.count ? args[index + 1] : nil

      switch key {
      case "--sessionId":
        sessionId = next ?? ""
        index += 2
      case "--micDeviceId":
        micDeviceId = next ?? "default"
        index += 2
      case "--includeSystemAudio":
        includeSystemAudio = (next ?? "true").lowercased() == "true"
        index += 2
      case "--chunkDurationMs":
        chunkDurationMs = Int(next ?? "500") ?? 500
        index += 2
      default:
        index += 1
      }
    }

    guard !sessionId.isEmpty else {
      throw NSError(domain: "ScopeAudioCapture", code: 64, userInfo: [NSLocalizedDescriptionKey: "sessionId is required"])
    }

    return CaptureArguments(
      sessionId: sessionId,
      micDeviceId: micDeviceId,
      includeSystemAudio: includeSystemAudio,
      chunkDurationMs: max(100, chunkDurationMs)
    )
  }
}

final class EventWriter {
  private let encoder = JSONEncoder()
  private let output = FileHandle.standardOutput
  private let errorOutput = FileHandle.standardError
  private let lock = NSLock()

  func emit(_ payload: [String: Any]) {
    lock.lock()
    defer { lock.unlock() }

    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
      return
    }

    output.write(data)
    output.write(Data([0x0a]))
  }

  func log(_ message: String) {
    guard let data = "\(message)\n".data(using: .utf8) else { return }
    errorOutput.write(data)
  }
}

final class PcmChunkAccumulator {
  private let source: CaptureSource
  private let framesPerChunk: Int
  private let writer: EventWriter
  private let lock = NSLock()
  private var data = Data()

  init(source: CaptureSource, sampleRateHz: Int, chunkDurationMs: Int, writer: EventWriter) {
    self.source = source
    self.framesPerChunk = max(1, (sampleRateHz * chunkDurationMs) / 1000)
    self.writer = writer
  }

  func append(_ pcm16: Data, frameCount: Int) {
    guard !pcm16.isEmpty, frameCount > 0 else { return }

    lock.lock()
    data.append(pcm16)

    let bytesPerChunk = framesPerChunk * MemoryLayout<Int16>.size
    while data.count >= bytesPerChunk {
      let chunk = data.prefix(bytesPerChunk)
      data.removeSubrange(0..<bytesPerChunk)
      emitChunk(Data(chunk), frames: framesPerChunk)
    }
    lock.unlock()
  }

  func flush() {
    lock.lock()
    defer { lock.unlock() }

    guard !data.isEmpty else { return }
    let frames = data.count / MemoryLayout<Int16>.size
    emitChunk(data, frames: frames)
    data.removeAll(keepingCapacity: false)
  }

  private func emitChunk(_ chunk: Data, frames: Int) {
    writer.emit([
      "type": "chunk",
      "source": source.rawValue,
      "audioBase64": chunk.base64EncodedString(),
      "frames": frames,
      "timestampMs": Int(Date().timeIntervalSince1970 * 1000)
    ])
  }
}

final class MicrophoneCapture {
  private let engine = AVAudioEngine()
  private let writer: EventWriter
  private let accumulator: PcmChunkAccumulator
  private let targetFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24_000, channels: 1, interleaved: false)!
  private var converter: AVAudioConverter?

  init(writer: EventWriter, accumulator: PcmChunkAccumulator) {
    self.writer = writer
    self.accumulator = accumulator
  }

  func start(micDeviceId: String) throws {
    if micDeviceId != "default" {
      writer.emit([
        "type": "warning",
        "code": "mic_device_selection_unimplemented",
        "message": "Using the system default microphone; custom mic device routing is not implemented yet."
      ])
    }

    let input = engine.inputNode
    let inputFormat = input.inputFormat(forBus: 0)
    converter = AVAudioConverter(from: inputFormat, to: targetFormat)

    input.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] buffer, _ in
      self?.handle(buffer: buffer)
    }

    engine.prepare()
    try engine.start()
  }

  func stop() {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    accumulator.flush()
  }

  private func handle(buffer: AVAudioPCMBuffer) {
    guard let converter else { return }

    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let targetCapacity = max(1, AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32)
    guard let converted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: targetCapacity) else {
      return
    }

    var error: NSError?
    var didProvideInput = false
    let status = converter.convert(to: converted, error: &error) { _, outStatus in
      if didProvideInput {
        outStatus.pointee = .noDataNow
        return nil
      }
      didProvideInput = true
      outStatus.pointee = .haveData
      return buffer
    }

    guard error == nil, status != .error, converted.frameLength > 0 else {
      if let error {
        writer.log("Microphone conversion failed: \(error.localizedDescription)")
      }
      return
    }

    guard let channel = converted.floatChannelData?.pointee else { return }
    let pcm = pcm16Data(from: channel, count: Int(converted.frameLength))
    accumulator.append(pcm, frameCount: Int(converted.frameLength))
  }
}

@available(macOS 13.0, *)
final class SystemAudioCapture: NSObject, SCStreamOutput {
  private let writer: EventWriter
  private let accumulator: PcmChunkAccumulator
  private let queue = DispatchQueue(label: "scope.audio.system")
  private var stream: SCStream?

  init(writer: EventWriter, accumulator: PcmChunkAccumulator) {
    self.writer = writer
    self.accumulator = accumulator
  }

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first else {
      throw NSError(domain: "ScopeAudioCapture", code: 65, userInfo: [NSLocalizedDescriptionKey: "No display available for system audio capture."])
    }

    let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
    let configuration = SCStreamConfiguration()
    configuration.width = 2
    configuration.height = 2
    configuration.capturesAudio = true
    configuration.excludesCurrentProcessAudio = true
    configuration.sampleRate = 24_000
    configuration.channelCount = 1

    let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
    try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
    try await stream.startCapture()
    self.stream = stream
  }

  func stop() async {
    do {
      try await stream?.stopCapture()
    } catch {
      writer.log("Stopping system audio capture failed: \(error.localizedDescription)")
    }
    accumulator.flush()
    stream = nil
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
    guard outputType == .audio else { return }
    guard CMSampleBufferIsValid(sampleBuffer), CMSampleBufferDataIsReady(sampleBuffer) else { return }
    guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
          let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
      return
    }

    let asbd = asbdPointer.pointee
    guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

    var totalLength = 0
    var dataPointer: UnsafeMutablePointer<Int8>?
    let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
    guard status == kCMBlockBufferNoErr, let dataPointer else { return }

    let sourcePointer = UnsafeRawPointer(dataPointer)
    let sampleCount = Int(CMSampleBufferGetNumSamples(sampleBuffer))

    if (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0, asbd.mBitsPerChannel == 32 {
      let floatPointer = sourcePointer.bindMemory(to: Float.self, capacity: sampleCount)
      let pcm = pcm16Data(from: floatPointer, count: sampleCount)
      accumulator.append(pcm, frameCount: sampleCount)
      return
    }

    if (asbd.mFormatFlags & kAudioFormatFlagIsSignedInteger) != 0, asbd.mBitsPerChannel == 16 {
      accumulator.append(Data(bytes: sourcePointer, count: totalLength), frameCount: sampleCount)
      return
    }

    writer.emit([
      "type": "warning",
      "code": "unsupported_system_audio_format",
      "message": "Received unsupported system audio format \(asbd.mBitsPerChannel)-bit flags \(asbd.mFormatFlags)."
    ])
  }
}

func pcm16Data(from floatPointer: UnsafePointer<Float>, count: Int) -> Data {
  var data = Data(count: count * MemoryLayout<Int16>.size)
  data.withUnsafeMutableBytes { rawBuffer in
    let destination = rawBuffer.bindMemory(to: Int16.self)
    for index in 0..<count {
      let sample = max(-1.0, min(1.0, floatPointer[index]))
      destination[index] = sample < 0 ? Int16(sample * 32768.0) : Int16(sample * 32767.0)
    }
  }
  return data
}

final class CaptureCoordinator {
  private let args: CaptureArguments
  private let writer = EventWriter()
  private lazy var micAccumulator = PcmChunkAccumulator(
    source: .mic,
    sampleRateHz: 24_000,
    chunkDurationMs: args.chunkDurationMs,
    writer: writer
  )
  private lazy var systemAccumulator = PcmChunkAccumulator(
    source: .system,
    sampleRateHz: 24_000,
    chunkDurationMs: args.chunkDurationMs,
    writer: writer
  )
  private lazy var microphoneCapture = MicrophoneCapture(writer: writer, accumulator: micAccumulator)
  @available(macOS 13.0, *)
  private lazy var systemAudioCapture = SystemAudioCapture(writer: writer, accumulator: systemAccumulator)
  private var signalSource: DispatchSourceSignal?

  init(args: CaptureArguments) {
    self.args = args
  }

  func run() async {
    do {
      try startSignalHandler()

      try microphoneCapture.start(micDeviceId: args.micDeviceId)

      if args.includeSystemAudio {
        guard #available(macOS 13.0, *) else {
          throw NSError(domain: "ScopeAudioCapture", code: 66, userInfo: [NSLocalizedDescriptionKey: "System audio capture requires macOS 13 or later."])
        }
        try await systemAudioCapture.start()
      }

      writer.emit([
        "type": "ready",
        "sampleRateHz": 24_000,
        "sources": args.includeSystemAudio ? ["mic", "system"] : ["mic"]
      ])

      dispatchMain()
    } catch {
      writer.emit([
        "type": "fatal",
        "code": "capture_start_failed",
        "message": error.localizedDescription
      ])
      exit(1)
    }
  }

  func stopAndExit() {
    Task {
      microphoneCapture.stop()
      if args.includeSystemAudio, #available(macOS 13.0, *) {
        await systemAudioCapture.stop()
      }
      writer.emit(["type": "stopped"])
      exit(0)
    }
  }

  private func startSignalHandler() throws {
    signal(SIGTERM, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    source.setEventHandler { [weak self] in
      self?.stopAndExit()
    }
    source.resume()
    signalSource = source
  }
}

@main
struct ScopeAudioCaptureMain {
  static func main() async {
    do {
      let args = try CaptureArguments.parse()
      let coordinator = CaptureCoordinator(args: args)
      await coordinator.run()
    } catch {
      let writer = EventWriter()
      writer.emit([
        "type": "fatal",
        "code": "invalid_arguments",
        "message": error.localizedDescription
      ])
      exit(1)
    }
  }
}
