export const isUndefined = (x: any): x is undefined => {
  return typeof x === "undefined"
}