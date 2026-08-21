import { functionsUrl, supabase } from '../lib/supabase';

export interface ApprovedReview {
  id: string;
  name: string;
  country: string | null;
  quote: string;
  rating: number;
  featured: boolean;
  image_url: string | null;
}

export interface SubmitReviewRequest {
  name: string;
  country?: string;
  quote: string;
  rating: number;
  turnstileToken?: string;
}

export interface SubmitReviewResult {
  id: string;
  status: string;
}

export async function getApprovedReviews(limit = 6): Promise<ApprovedReview[]> {
  const db = supabase as any;
  const { data, error } = await db
    .from('reviews')
    .select('id, name, country, quote, rating, featured, image_url')
    .eq('status', 'approved')
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ApprovedReview[];
}

export async function submitReview(input: SubmitReviewRequest): Promise<SubmitReviewResult> {
  const response = await fetch(`${functionsUrl}/create-review`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message ?? 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as SubmitReviewResult;
}
