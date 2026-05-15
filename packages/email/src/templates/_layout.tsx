import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import { appUrl, emailTheme } from '../theme';

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body
          style={{
            backgroundColor: emailTheme.background,
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            margin: 0,
            padding: '40px 0',
            color: emailTheme.textPrimary,
          }}
        >
          <Container
            style={{
              maxWidth: '560px',
              margin: '0 auto',
              backgroundColor: emailTheme.backgroundSecondary,
              borderRadius: '16px',
              border: `1px solid ${emailTheme.borderSubtle}`,
              padding: '40px',
            }}
          >
            <Section style={{ textAlign: 'center', marginBottom: '32px' }}>
              <Link href={appUrl} style={{ textDecoration: 'none' }}>
                <Text
                  style={{
                    color: emailTheme.brandPrimary,
                    fontSize: '24px',
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.03em',
                  }}
                >
                  WorkChain
                </Text>
              </Link>
            </Section>
            {children}
            <Section
              style={{
                marginTop: '48px',
                paddingTop: '24px',
                borderTop: `1px solid ${emailTheme.borderSubtle}`,
              }}
            >
              <Text
                style={{
                  color: emailTheme.textTertiary,
                  fontSize: '12px',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                Work. Trust. Chain.
              </Text>
              <Text
                style={{
                  color: emailTheme.textTertiary,
                  fontSize: '12px',
                  textAlign: 'center',
                  marginTop: '8px',
                }}
              >
                <Link href={`${appUrl}/settings/notifications`} style={{ color: emailTheme.textTertiary }}>
                  Manage notifications
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: emailTheme.textPrimary,
        fontSize: '28px',
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: '-0.02em',
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: emailTheme.textSecondary,
        fontSize: '15px',
        lineHeight: 1.65,
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  );
}

export function CtaButton({ href, label }: { href: string; label: string }) {
  return (
    <Section style={{ textAlign: 'center', margin: '32px 0' }}>
      <Link
        href={href}
        style={{
          background: `linear-gradient(135deg, ${emailTheme.brandPrimary} 0%, ${emailTheme.brandSecondary} 100%)`,
          color: '#07091A',
          fontSize: '15px',
          fontWeight: 700,
          textDecoration: 'none',
          padding: '14px 32px',
          borderRadius: '10px',
          display: 'inline-block',
        }}
      >
        {label}
      </Link>
    </Section>
  );
}
