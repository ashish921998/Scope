import type { DossierGenerateInput } from "@scope/types";
import { DossierRepo } from "../db/dossierRepo";
import { FeatureRepo } from "../db/featureRepo";
import { SignalRepo } from "../db/signalRepo";
import { generateFeatureDossier } from "./pipeline";

export class DossierService {
  constructor(
    private readonly signalRepo: SignalRepo,
    private readonly dossierRepo: DossierRepo,
    private readonly featureRepo: FeatureRepo,
    private readonly getAnthropicKey?: () => Promise<string | null>
  ) {}

  async generate(input: DossierGenerateInput) {
    const signals = input.signalIds?.length
      ? this.signalRepo.listByIds(input.signalIds)
      : this.resolveFeatureSignals(input.featureId);

    const anthropicKey = this.getAnthropicKey ? await this.getAnthropicKey() : null;
    const dossier = await generateFeatureDossier(input.featureId, signals, anthropicKey);
    return this.dossierRepo.save(dossier);
  }

  get(id: string) {
    return this.dossierRepo.get(id);
  }

  private resolveFeatureSignals(featureId: string) {
    const feature = this.featureRepo.get(featureId);
    if (!feature) {
      throw new Error(`Feature candidate ${featureId} not found.`);
    }

    return this.signalRepo.listByIds(feature.signalIds);
  }
}
