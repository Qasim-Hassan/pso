import pastPapersJson from "@/data/past-papers.json";
import questionsJson from "@/data/questions.json";
import resourcesJson from "@/data/resources.json";
import { guideSourceResources } from "@/lib/guide-source-resources";

export type ResourceItem = {
  id: string;
  title: string;
  description: string;
  subject: string;
  kind: string;
  folder: string;
  year: number | null;
  pages: number;
  sizeBytes: number;
  localUrl: string | null;
  sourceUrl: string;
};

type RawResourceItem = Omit<ResourceItem, "description"> & { description?: string };

export type PastPaper = {
  id: string;
  title: string;
  exam: string;
  subject: string;
  year: number;
  pages: number;
  resourceUrl: string | null;
  sourceUrl: string;
  scanned: boolean;
  pageImages: string[];
  questionCount: number;
  mcqCount: number;
  descriptiveCount: number;
  partICount: number;
  partIICount: number;
};

export type Question = {
  id: string;
  paperId: string;
  paperSubject: string;
  number: number;
  displayNumber: string;
  subject: string;
  topic: string;
  difficulty: string;
  type: "MCQ" | "Long";
  section: string;
  sectionTitle: string;
  exam: string;
  year: number;
  source: string;
  prompt: string;
  options: string[];
  answer: number | null;
  solution: string;
  page: number | null;
  figure: string;
};

const resourceTitles: Record<string, string> = {
  "ioaa-everaise-astro-book-ed1-protected-unlocked": "Everaise Astronomy Handbook, Edition 1",
  "ioaa-1-fundamentals-of-astronomy-a-guide-for-olympiads": "Fundamentals of Astronomy: A Guide for Olympiads",
  "ioaa-caao-tutorial": "CAAO Tutorial",
  "ioaa-ioaa-problems-until-2013-by-topic": "IOAA Problems by Topic through 2013",
  "ioaa-fundamental-astronomy-6th-ed-2017-edition": "Fundamental Astronomy, 6th Edition",
  "ioaa-probability-for-the-enthusiastic-beginner-david-morin-2016-createspace-9781523318674-d34dfadd448fdfcf0fc0e330c43b219d-anna-s-archive": "Probability for the Enthusiastic Beginner",
  "ioaa-schaum-s-outlines-of-astronomy": "Schaum's Outlines of Astronomy",
  "ioaa-starmaps101": "Star Maps 101",
  "ioaa-a-student-s-guide-to-the-mathematics-of-astronomy": "A Student's Guide to the Mathematics of Astronomy",
  "physics-physics-10": "Pakistan Physics Textbook, Grade 10",
  "physics-physics-9": "Pakistan Physics Textbook, Grade 9",
  "physics-physicsbook1": "Physics Textbook, Book 1",
  "physics-hrk-physics-2": "Halliday, Resnick & Krane Physics, Volume 2",
};

function titleCase(value: string) {
  const smallWords = new Set(["a", "an", "and", "as", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function cleanedResourceTitle(resource: RawResourceItem) {
  if (resourceTitles[resource.id]) return resourceTitles[resource.id];
  if (resource.kind === "Past Paper") {
    return `NSTC ${resource.subject} Past Paper${resource.year ? ` ${resource.year}` : ""}`;
  }
  if (/^0\d Chapter /.test(resource.title)) {
    return resource.title.replace(/^0?(\d+) Chapter /, "Chapter $1: ");
  }
  if (/^Final Maths /.test(resource.title)) {
    return resource.title.replace("Final Maths", "NSTC Mathematics Past Paper");
  }
  if (/^Final /.test(resource.title)) {
    return resource.title.replace("Final", "NSTC");
  }
  if (/^PSET /.test(resource.title)) {
    return resource.title.replace("PSET", "Problem Set");
  }
  return titleCase(resource.title.replace(/Annaâ€™s Archive|Anna's Archive/g, "").replace(/\b([A-Za-z]+)\s+s\b/g, "$1's"));
}

function resourceDescription(resource: RawResourceItem, title: string) {
  if (resource.description) return resource.description;
  if (resource.kind === "Past Paper") {
    return `Original NSTC ${resource.subject.toLowerCase()} paper${resource.year ? ` from ${resource.year}` : ""} for timed practice and review.`;
  }
  if (resource.kind === "Problem Set") {
    return `${resource.subject} practice set for focused drills, revision, and timed problem solving.`;
  }
  if (resource.kind === "Solution") {
    return `Worked solution file for checking approaches after attempting the matching problem set.`;
  }
  if (resource.kind === "Guide") {
    return `${title} for planning study order, prerequisites, and preparation strategy.`;
  }
  if (resource.kind === "Book") {
    return `${resource.subject} reference text for building the theory needed before harder olympiad problems.`;
  }
  if (title.includes("Taylor Error")) {
    return "Error-analysis reference for observational astronomy and experimental uncertainty.";
  }
  if (title.includes("Star Maps")) {
    return "Sky-map practice resource for observation, recognition, and orientation work.";
  }
  return `${resource.subject} reference file for deeper study, revision, or problem-solving support.`;
}

function normalizeResource(resource: RawResourceItem): ResourceItem {
  const title = cleanedResourceTitle(resource);
  return {
    ...resource,
    title,
    description: resourceDescription(resource, title),
  };
}

export const resources = [...(resourcesJson as RawResourceItem[]), ...(guideSourceResources as RawResourceItem[])].map(normalizeResource);
export const pastPapers = pastPapersJson as PastPaper[];
export const questions = questionsJson as Question[];

export function getPaperById(id: string) {
  return pastPapers.find((paper) => paper.id === id) ?? null;
}

export function getQuestionsForPaper(id: string) {
  return questions.filter((question) => question.paperId === id);
}

export function getQuestionStats() {
  const subjects = new Set(questions.map((question) => question.subject));
  const papers = new Set(questions.map((question) => question.paperId).filter(Boolean));
  return {
    total: questions.length,
    subjects: subjects.size,
    papers: papers.size,
    mcqs: questions.filter((question) => question.type === "MCQ").length,
    long: questions.filter((question) => question.type === "Long").length,
  };
}

export function getResourceStats() {
  return {
    total: resources.length,
    local: resources.filter((resource) => resource.localUrl).length,
    external: resources.filter((resource) => !resource.localUrl).length,
    subjects: new Set(resources.map((resource) => resource.subject)).size,
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
