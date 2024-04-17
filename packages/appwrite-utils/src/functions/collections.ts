export const areCollectionNamesSame = (a: string, b: string) => {
  return (
    a.toLowerCase().trim().replace(" ", "") ===
    b.toLowerCase().trim().replace(" ", "")
  );
};
