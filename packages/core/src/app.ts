import { DossierService } from "./dossier/service";
import { initDb } from "./db/client";
import { DossierRepo } from "./db/dossierRepo";
import { EmbeddingRepo } from "./db/embeddingRepo";
import { FeatureRepo } from "./db/featureRepo";
import { InterviewRepo } from "./db/interviewRepo";
import { SignalRepo } from "./db/signalRepo";
import { ExportService } from "./export/service";
import { InterviewService } from "./interviews/service";
import { SignalService } from "./signals/service";

export interface CoreServicesOptions {
  encryptionKey?: string;
  requireEncryption?: boolean;
  cipher?: string;
  getAnthropicKey?: () => Promise<string | null>;
}

export interface CoreServices {
  interviewService: InterviewService;
  signalService: SignalService;
  dossierService: DossierService;
  exportService: ExportService;
  repos: {
    featureRepo: FeatureRepo;
    signalRepo: SignalRepo;
    dossierRepo: DossierRepo;
  };
}

export const createCoreServices = (dbPath: string, options: CoreServicesOptions = {}): CoreServices => {
  const db = initDb(dbPath, {
    encryptionKey: options.encryptionKey,
    requireEncryption: options.requireEncryption,
    cipher: options.cipher
  });

  const interviewRepo = new InterviewRepo(db);
  const signalRepo = new SignalRepo(db);
  const featureRepo = new FeatureRepo(db);
  const dossierRepo = new DossierRepo(db);
  const embeddingRepo = new EmbeddingRepo(db);

  const interviewService = new InterviewService(interviewRepo);
  const signalService = new SignalService(signalRepo, featureRepo, embeddingRepo);
  const dossierService = new DossierService(signalRepo, dossierRepo, featureRepo, options.getAnthropicKey);
  const exportService = new ExportService(dossierRepo);

  return {
    interviewService,
    signalService,
    dossierService,
    exportService,
    repos: {
      featureRepo,
      signalRepo,
      dossierRepo
    }
  };
};
