import { DossierService } from "./dossier/service";
import { initDb } from "./db/client";
import { DossierRepo } from "./db/dossierRepo";
import { EmbeddingRepo } from "./db/embeddingRepo";
import { FeatureRepo } from "./db/featureRepo";
import { InterviewRepo } from "./db/interviewRepo";
import { SignalRepo } from "./db/signalRepo";
import { TokenRepo } from "./db/tokenRepo";
import { ExportService } from "./export/service";
import { InterviewService } from "./interviews/service";
import { SignalService } from "./signals/service";

export interface CoreServices {
  interviewService: InterviewService;
  signalService: SignalService;
  dossierService: DossierService;
  exportService: ExportService;
  repos: {
    tokenRepo: TokenRepo;
    featureRepo: FeatureRepo;
    signalRepo: SignalRepo;
    dossierRepo: DossierRepo;
  };
}

export const createCoreServices = (dbPath: string): CoreServices => {
  const db = initDb(dbPath);

  const interviewRepo = new InterviewRepo(db);
  const signalRepo = new SignalRepo(db);
  const featureRepo = new FeatureRepo(db);
  const dossierRepo = new DossierRepo(db);
  const tokenRepo = new TokenRepo(db);
  const embeddingRepo = new EmbeddingRepo(db);

  const interviewService = new InterviewService(interviewRepo);
  const signalService = new SignalService(signalRepo, featureRepo, embeddingRepo);
  const dossierService = new DossierService(signalRepo, dossierRepo, featureRepo);
  const exportService = new ExportService(dossierRepo);

  return {
    interviewService,
    signalService,
    dossierService,
    exportService,
    repos: {
      tokenRepo,
      featureRepo,
      signalRepo,
      dossierRepo
    }
  };
};
