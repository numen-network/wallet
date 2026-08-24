/**
 * The column every band of the page lines up with, header down to footer.
 * Bands sit in a flex column, where an auto margin cancels the stretch, so the
 * full width has to be asked for.
 *
 * Four cards to a row. Four times the 400px a card asks for, plus the gaps and
 * the padding, needs 1654, and the rest is breathing room a fifth column cannot
 * reach.
 */
export const SHELL = 'mx-auto w-full max-w-[1700px] px-6 max-[560px]:px-4'
