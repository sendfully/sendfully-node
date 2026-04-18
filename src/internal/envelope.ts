export interface SuccessEnvelope {
  success: true;
  [key: string]: unknown;
}

export interface ErrorEnvelope {
  success: false;
  message: string;
  id?: string;
}

export type Envelope<T extends SuccessEnvelope = SuccessEnvelope> = T | ErrorEnvelope;
