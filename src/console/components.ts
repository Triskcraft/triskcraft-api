import { escapeAttribute, html } from './html';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  children: string;
  type?: 'button' | 'reset' | 'submit';
  variant?: ButtonVariant;
  className?: string;
  id?: string;
  disabled?: boolean;
}

function attributes(variant: ButtonVariant, className?: string, id?: string) {
  const classes = ['button', `button-${variant}`, className]
    .filter(Boolean)
    .join(' ');
  return html`class="${escapeAttribute(classes)}"${id ? html` id="${escapeAttribute(id)}"` : ''}`;
}

export function Button({
  children,
  type = 'button',
  variant = 'primary',
  className,
  id,
  disabled,
}: ButtonProps) {
  return html`<button
    type="${type}"
    ${attributes(variant, className, id)}
    ${disabled ? 'disabled' : ''}
  >
    ${children}
  </button>`;
}

export function AnchorButton({
  children,
  href,
  variant = 'primary',
  className,
  id,
}: Omit<ButtonProps, 'type' | 'disabled'> & { href: string }) {
  return html`<a
    href="${escapeAttribute(href)}"
    ${attributes(variant, className, id)}
    >${children}</a
  >`;
}

export function InputSubmitButton({
  value,
  variant = 'primary',
  name,
}: {
  value: string;
  variant?: ButtonVariant;
  name?: string;
}) {
  return html`<input
    type="submit"
    value="${escapeAttribute(value)}"
    ${name ? html`name="${escapeAttribute(name)}"` : ''}
    ${attributes(variant)}
  />`;
}

export function Layout({
  children,
  title = 'Console Admin',
}: {
  children: string;
  title?: string;
}) {
  return html`<!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeAttribute(title)}</title>
        <style>
          body {
            font-family:
              -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f4f4f9;
          }
          .container {
            text-align: center;
            width: 100%;
            max-width: 400px;
            padding: 20px;
          }
          h1 {
            color: #333;
            margin-bottom: 20px;
          }
          .menu-links {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .button {
            align-items: center;
            border: 0;
            border-radius: 6px;
            box-sizing: border-box;
            cursor: pointer;
            display: inline-flex;
            font: inherit;
            font-weight: 700;
            justify-content: center;
            padding: 10px 14px;
            text-decoration: none;
            transition:
              background-color 0.2s,
              color 0.2s;
          }
          .button-primary {
            color: #fff;
            background: #5865f2;
          }
          .button-primary:hover {
            background: #4752c4;
          }
          .button-secondary {
            background: #6c757d;
            color: #fff;
          }
          .button-secondary:hover {
            background: #5a6268;
          }
          .button-danger {
            background: #dc3545;
            color: #fff;
          }
          .button-danger:hover {
            background: #b42332;
          }
          .button:disabled {
            cursor: not-allowed;
            opacity: 0.5;
          }
          .menu-links .button {
            width: 100%;
          }
        </style>
      </head>
      <body>
        ${children}
      </body>
    </html>`;
}

export function ErrorCard({
  title = '¡Ups! Algo salió mal',
  message,
  code = 500,
  backUrl = '/',
}: {
  title?: string;
  message: string;
  code?: number | string;
  backUrl?: string;
}) {
  return html`<div class="container">
      <div class="error-card">
        <div class="error-icon">⚠️</div>
        <span class="error-code">${code}</span>
        <h1>${escapeAttribute(title)}</h1>
        <p class="error-message">${escapeAttribute(message)}</p>
        <div class="menu-links">
          ${AnchorButton({ href: backUrl, children: 'Volver al inicio', variant: 'secondary' })}
        </div>
      </div>
    </div>
    <style>
      .error-card {
        background: #fff;
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        border-top: 5px solid #dc3545;
      }
      .error-icon {
        font-size: 3rem;
        margin-bottom: 10px;
      }
      .error-code {
        display: block;
        font-size: 1.2rem;
        font-weight: bold;
        color: #dc3545;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 5px;
      }
      .error-message {
        color: #666;
        line-height: 1.5;
        margin-bottom: 30px;
      }
    </style>`;
}
