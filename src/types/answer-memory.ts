import type { DetectedApplicationField } from '../ai/application-answers';

export interface MissingApplicationField extends DetectedApplicationField {
  required?: boolean;
  rememberable?: boolean;
}
