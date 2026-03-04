import type { DossierGenerateInput } from "@scope/types";
import { DossierRepo } from "../db/dossierRepo";
import { FeatureRepo } from "../db/featureRepo";
import { SignalRepo } from "../db/signalRepo";
import { generateFeatureDossier } from "./pipeline";

export class DossierService {
  constructor(
    private readonly signalRepo: SignalRepo,
    private readonly dossierRepo: DossierRepo,
    private readonly featureRepo: FeatureRepo
  ) {}

  generate(input: DossierGenerateInput) {
    const signals = input.signalIds?.length
      ? this.signalRepo.listByIds(input.signalIds)
      : this.resolveFeatureSignals(input.featureId);

    const dossier = generateFeatureDossier(input.featureId, signals);
    return this.dossierRepo.save(dossier);
  }

  get(id: string) {
    return this.dossierRepo.get(id);
  }

  private resolveFeatureSignals(featureId: string) {
    const feature = this.featureRepo.list().find((item: { id: string }) => item.id === featureId);
    if (!feature) {
      throw new Error(`Feature candidate ${featureId} not found.`);
    }

    return this.signalRepo.listByIds(feature.signalIds);
  }
}
