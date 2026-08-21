export interface ShortcutLink {
  id: string;
  label: string;
  url: string;
  image_url: string | null;
}

export interface ShortcutLinkCreate {
  label: string;
  url: string;
  image_url?: string | null;
}

export interface ShortcutLinkUpdate {
  label?: string;
  url?: string;
  image_url?: string | null;
}
