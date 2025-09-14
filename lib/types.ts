export type Card = {
  imageUrl: string;
  commonName: string;       // English preferred, may fall back to scientificName
  scientificName: string;
  license: string;
  source: string;           // link to original
  attributions: string[];   // e.g., photographer or page authors if available
};
