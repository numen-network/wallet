import { toast, toastProblem } from './Toast'

/**
 * Every copy in the wallet goes through here, so the feedback is always the
 * same. The clipboard API only exists on a secure page, and a page served over
 * plain http has to say so rather than throw.
 */
export function copyText(text: string): void {
  if (!navigator.clipboard) {
    toastProblem('Copying needs a page served over https')
    return
  }

  navigator.clipboard.writeText(text).then(
    () => toast('Copied'),
    () => toastProblem('Could not reach the clipboard'),
  )
}
