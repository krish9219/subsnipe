import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

const THEME_KEY = 'subsnipe-theme';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ThemeContext = createContext<{ theme: 'light' | 'dark'; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* private mode */
    }
    return systemTheme();
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggle: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): { theme: 'light' | 'dark'; toggle: () => void } {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('Theme missing');
  return value;
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0e5c59" />
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="#f4f0e6" strokeWidth="1.6" />
      <path
        d="M16 5.5v4.2M16 22.3v4.2M5.5 16h4.2M22.3 16h4.2"
        stroke="#e7a15a"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="1.6" fill="#e7a15a" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark className="h-8 w-8" />
      <span className="font-serif text-xl tracking-tight">SubSnipe</span>
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:opacity-50',
        size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-4 text-sm',
        variant === 'primary' && 'bg-accent text-accentink hover:opacity-90',
        variant === 'quiet' && 'border border-line bg-elev text-ink hover:bg-hover',
        variant === 'ghost' && 'text-ink hover:bg-hover',
        variant === 'danger' && 'bg-bad text-white',
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-elev text-ink hover:bg-hover',
        className,
      )}
      {...props}
    />
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={toggle}>
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </IconButton>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? 'max-w-3xl' : undefined}
      onClose={onClose}
    >
      <div className="panel max-h-[85vh] overflow-auto p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-2xl tracking-tight">
            {title}
          </h2>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function inkFor(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length < 6) return '#fffdf8';
  const channel = (start: number) => Number.parseInt(raw.slice(start, start + 2), 16) / 255;
  const r = channel(0);
  const g = channel(2);
  const b = channel(4);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? '#1c1915' : '#fffdf8';
}

export function Initial({ name, color }: { name: string; color: string }) {
  const letters = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold"
      style={{ background: color, color: inkFor(color) }}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}
