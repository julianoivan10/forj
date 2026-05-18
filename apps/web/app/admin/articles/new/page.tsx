import type { Metadata } from 'next';
import { ArticleEditor } from '@/components/admin/article-editor';

export const metadata: Metadata = {
  title: 'New article',
};

export default function NewArticlePage() {
  return <ArticleEditor mode="new" />;
}
