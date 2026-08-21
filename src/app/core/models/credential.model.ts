export interface AppCredential {
  id: string;
  app: string;
  username: string;
  password: string;
}

export interface AppCredentialCreate {
  app: string;
  username: string;
  password: string;
}
