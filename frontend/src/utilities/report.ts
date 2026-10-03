export { report } from '../../report.js';

export type ReportContext = {
  region: 'board' | 'preview' | 'layers' | 'layers-row' | 'details' | 'inspector';
  screenId?: string | null;
  elementKey?: string;
};
