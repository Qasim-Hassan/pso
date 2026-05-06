import { notFound } from "next/navigation";
import { PastPaperWorkspace } from "@/components/interactive/past-paper-workspace";
import { Container } from "@/components/sections/common";
import { getPaperById, getQuestionsForPaper, pastPapers } from "@/lib/content-data";

export function generateStaticParams() {
  return pastPapers.map((paper) => ({ paperId: paper.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const paper = getPaperById(paperId);
  return {
    title: paper?.title ?? "Past Paper Practice",
  };
}

export default async function PastPaperDetailPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const paper = getPaperById(paperId);
  if (!paper) notFound();
  const paperQuestions = getQuestionsForPaper(paper.id);

  return (
    <section className="py-4 md:py-6">
      <Container>
        <PastPaperWorkspace paper={paper} questions={paperQuestions} papers={pastPapers} />
      </Container>
    </section>
  );
}
