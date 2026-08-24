export interface MessageSnippet {
  id: string;
  label: string;
  html: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface MessageSnippetCreate {
  label: string;
  html: string;
  text: string;
}

export interface MessageSnippetUpdate {
  label?: string;
  html?: string;
  text?: string;
}
