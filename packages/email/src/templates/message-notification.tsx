import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface MessageNotificationEmailProps {
  recipientName: string;
  senderName: string;
  snippet: string;
  conversationId: string;
}

export function MessageNotificationEmail({
  recipientName,
  senderName,
  snippet,
  conversationId,
}: MessageNotificationEmailProps) {
  return (
    <EmailLayout preview={`New message from ${senderName}`}>
      <Heading>New message from {senderName}</Heading>
      <Paragraph>Hi {recipientName},</Paragraph>
      <Paragraph>
        <em>&ldquo;{snippet}&rdquo;</em>
      </Paragraph>
      <CtaButton href={`${appUrl}/messages/${conversationId}`} label="Open Conversation" />
    </EmailLayout>
  );
}

MessageNotificationEmail.PreviewProps = {
  recipientName: 'Alex',
  senderName: 'Jordan',
  snippet: 'Hey, I have a quick question about the scope...',
  conversationId: 'conv-abc',
} satisfies MessageNotificationEmailProps;

export default MessageNotificationEmail;
