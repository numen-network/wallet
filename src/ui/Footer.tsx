import type { IconType } from '@icons-pack/react-simple-icons'
import { SiBitcoin, SiDiscord, SiGithub, SiTelegram, SiX, SiYoutube } from '@icons-pack/react-simple-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { SHELL } from './shell'

const SOCIAL: [label: string, href: string, Mark: IconType][] = [
  ['GitHub', 'https://github.com/numen-network/wallet', SiGithub],
  ['Discord', 'https://discord.gg/ajPKdvrvJK', SiDiscord],
  ['X', 'https://x.com/numen_network', SiX],
  ['Telegram', 'https://t.me/numen_network', SiTelegram],
  ['Bitcointalk', 'https://bitcointalk.org/index.php?action=profile;u=3763959', SiBitcoin],
  ['YouTube', 'https://www.youtube.com/@numen_network', SiYoutube],
]

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className={cn(SHELL, 'flex flex-wrap items-center gap-x-8 gap-y-3 py-4 text-xs text-muted-foreground')}>
        <span>© 2026 Numen Network</span>
        <span>Build {__COMMIT__.slice(0, 7)}</span>
        <div className="ml-auto flex items-center">
          {SOCIAL.map(([label, href, Mark]) => (
            <Button key={label} asChild variant="ghost" size="icon">
              <a href={href} target="_blank" rel="noopener" aria-label={label}>
                <Mark size={16} title="" />
              </a>
            </Button>
          ))}
        </div>
      </div>
    </footer>
  )
}
