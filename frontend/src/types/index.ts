export interface Screen {
  id: string;
  name: string;
  url: string;
}

export interface ElementDetails {
  component: string;
  description: string;
  status: 'stable' | 'beta' | 'deprecated';
  owner: string;
}

export type Mode = 'select' | 'interact';
