/** A count and what it counts, so nothing reads as "1 votes". */
export function plural(many: number, noun: string): string {
  return `${many} ${noun}${many === 1 ? '' : 's'}`
}
