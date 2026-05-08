"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/sections/common";
import type { PastPaper, Question } from "@/lib/content-data";
import { cn } from "@/lib/utils";

type Mode = "attempt" | "review";
const PAST_PAPER_TIMER_SECONDS = 3 * 60 * 60;

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

function displayQuestionNumber(question: Question) {
  return question.displayNumber ?? String(question.number);
}

function navigatorLabel(question: Question, index: number) {
  if (question.section === "Part III") return `D${index + 1}`;
  return displayQuestionNumber(question);
}

function formatPromptLines(prompt: string) {
  return prompt
    .replace(/@@Q(\d+)@@/g, "$1")
    .replace(//g, "\n- ")
    .replace(/----+/g, "")
    .replace(/\s+Instructions:/gi, "\nInstructions:")
    .replace(/\s+Solved example:/gi, "\nSolved example:")
    .replace(/\s+Answer:/gi, "\nAnswer:")
    .replace(/\s+(Question\s+(?:No\s*)?\d+\s*:)/gi, "\n$1")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isAnswered(question: Question, answers: Record<string, number>, writtenAnswers: Record<string, string>) {
  if (question.options.length > 0) return answers[question.id] !== undefined;
  return Boolean(writtenAnswers[question.id]?.trim());
}

export function PastPaperWorkspace({ paper, questions, papers }: { paper: PastPaper; questions: Question[]; papers: PastPaper[] }) {
  const initialSeconds = PAST_PAPER_TIMER_SECONDS;
  const [seconds, setSeconds] = useState(initialSeconds);
  const [timerRunning, setTimerRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("attempt");
  const [section, setSection] = useState("Part I");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState(new Set<string>());
  const [scratchpad, setScratchpad] = useState("");

  useEffect(() => {
    if (!timerRunning || seconds <= 0) return;
    const id = window.setInterval(() => {
      setSeconds((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) setTimerRunning(false);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds, timerRunning]);

  const sections = useMemo(
    () => [
      { key: "Part I", label: "Common MCQs", count: questions.filter((question) => question.section === "Part I").length },
      { key: "Part II", label: `${paper.subject} MCQs`, count: questions.filter((question) => question.section === "Part II").length },
      { key: "Part III", label: "Descriptive", count: questions.filter((question) => question.section === "Part III").length },
    ],
    [paper.subject, questions],
  );

  const sectionQuestions = useMemo(() => {
    const scoped = questions.filter((question) => question.section === section);
    return scoped.length ? scoped : questions;
  }, [questions, section]);

  const current = sectionQuestions[currentIndex] ?? sectionQuestions[0] ?? questions[0];
  const answeredCount = useMemo(() => questions.filter((question) => isAnswered(question, answers, writtenAnswers)).length, [answers, questions, writtenAnswers]);
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const scoreableQuestions = useMemo(() => questions.filter((question) => question.answer !== null && answers[question.id] !== undefined), [answers, questions]);
  const correctCount = scoreableQuestions.filter((question) => answers[question.id] === question.answer).length;
  const relatedPapers = useMemo(() => papers.filter((item) => item.id !== paper.id && item.subject === paper.subject).slice(0, 4), [paper.id, paper.subject, papers]);

  function chooseAnswer(index: number) {
    if (!current || mode === "review") return;
    setAnswers((previous) => ({ ...previous, [current.id]: index }));
  }

  function updateWrittenAnswer(value: string) {
    if (!current || mode === "review") return;
    setWrittenAnswers((previous) => ({ ...previous, [current.id]: value }));
  }

  function clearAnswer() {
    if (!current || mode === "review") return;
    if (current.options.length > 0) {
      setAnswers((previous) => {
        const next = { ...previous };
        delete next[current.id];
        return next;
      });
      return;
    }
    setWrittenAnswers((previous) => {
      const next = { ...previous };
      delete next[current.id];
      return next;
    });
  }

  function goTo(index: number) {
    setCurrentIndex(Math.max(0, Math.min(sectionQuestions.length - 1, index)));
  }

  function toggleMark(id: string) {
    setMarked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    if (nextMode === "review") setTimerRunning(false);
  }

  if (!current) {
    return (
      <div className="card-surface rounded-md p-8 text-center">
        <h2 className="font-display text-3xl font-bold text-charcoal">No extracted questions yet</h2>
        <p className="mt-2 text-charcoal/70">This paper is available as a resource, but question extraction did not produce reviewable items.</p>
      </div>
    );
  }

  const selectedAnswer = answers[current.id];
  const writtenAnswer = writtenAnswers[current.id] ?? "";
  const promptLines = current.options.length === 0 ? formatPromptLines(current.prompt) : [];
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < sectionQuestions.length - 1;

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-navy/10 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{paper.exam}</Badge>
              <span className="rounded-md bg-mint px-2.5 py-1 text-xs font-black uppercase text-emerald">{paper.subject}</span>
              <span className="rounded-md bg-cool/70 px-2.5 py-1 text-xs font-black uppercase text-charcoal/70">{paper.year}</span>
            </div>
            <h1 className="mt-3 text-2xl font-black leading-tight text-charcoal md:text-3xl">{paper.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal/70">
              {mode === "attempt" ? "Attempt the paper without solution leakage. Use review mode after you are done to inspect answers, marked items, and explanations." : "Review mode pauses the timer and unlocks answer keys, saved responses, and explanations."}
            </p>
          </div>

          <div className="rounded-md border border-navy/10 bg-ivory p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-charcoal/60">Timer</p>
                <p className={cn("font-mono text-3xl font-black", seconds === 0 ? "text-red-600" : "text-charcoal")}>{formatTime(seconds)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className={cn("flex h-11 w-11 items-center justify-center rounded-md text-white", timerRunning ? "bg-navy" : "bg-emerald")}
                  onClick={() => setTimerRunning((value) => !value)}
                  type="button"
                  aria-label={timerRunning ? "Pause timer" : "Start timer"}
                >
                  <Icon name={timerRunning ? "pause" : "play"} className="h-5 w-5" />
                </button>
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-md border border-navy/10 bg-white text-charcoal"
                  onClick={() => {
                    setTimerRunning(false);
                    setSeconds(initialSeconds);
                  }}
                  type="button"
                  aria-label="Reset timer"
                >
                  <Icon name="reset" className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-navy/10 bg-white">
              <button className={cn("px-3 py-2.5 text-sm font-black", mode === "attempt" ? "bg-emerald text-white" : "text-charcoal")} onClick={() => switchMode("attempt")} type="button">
                Attempt
              </button>
              <button className={cn("px-3 py-2.5 text-sm font-black", mode === "review" ? "bg-navy text-white" : "text-charcoal")} onClick={() => switchMode("review")} type="button">
                Review
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label>
            <span className="text-xs font-black uppercase text-charcoal/60">Paper</span>
            <select
              className="mt-2 h-11 w-full rounded-md border border-navy/10 bg-white px-3 text-sm font-bold text-charcoal outline-none focus:border-emerald"
              value={paper.id}
              onChange={(event) => {
                window.location.href = `/past-papers/${event.target.value}`;
              }}
            >
              {papers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-xs font-black uppercase text-charcoal/60">Progress</span>
            <div className="mt-2 rounded-md border border-navy/10 bg-white px-3 py-2">
              <div className="flex items-center justify-between text-sm font-black text-charcoal">
                <span>
                  {answeredCount} / {questions.length}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-cool">
                <div className="h-2 rounded-full bg-emerald" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {sections.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setSection(item.key);
                setCurrentIndex(0);
              }}
              className={cn(
                "rounded-md border px-4 py-3 text-left transition",
                section === item.key ? "border-emerald bg-mint text-emerald" : "border-navy/10 bg-white text-charcoal hover:border-emerald/40",
              )}
            >
              <span className="text-sm font-black">{item.label}</span>
              <span className="mt-1 block text-xs font-bold opacity-70">{item.count} questions</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-md border border-navy/10 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-navy/10 p-4 md:p-5">
            <Badge>Question {displayQuestionNumber(current)}</Badge>
            <span className="rounded-md bg-cool/70 px-2.5 py-1 text-xs font-black uppercase text-charcoal/70">{current.sectionTitle}</span>
            <span className="rounded-md bg-cool/70 px-2.5 py-1 text-xs font-black uppercase text-charcoal/70">{current.type}</span>
            <button className="ml-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-black text-charcoal hover:bg-mint" onClick={() => toggleMark(current.id)} type="button">
              <Icon name="bookmark" className={cn("h-4 w-4", marked.has(current.id) && "text-gold")} />
              {marked.has(current.id) ? "Marked" : "Mark"}
            </button>
          </div>

          <div className="p-4 md:p-6">
            {current.options.length > 0 ? (
              <p className="max-w-4xl text-xl font-semibold leading-9 text-charcoal md:text-2xl md:leading-10">{current.prompt}</p>
            ) : (
              <div className="space-y-3">
                {promptLines.map((line, index) => {
                  const isQuestionLine = /^Question\s+(?:No\s*)?\d+\s*:/i.test(line);
                  const isInstruction = /^(Instructions|Solved example|Answer):/i.test(line) || line.startsWith("-");
                  return (
                    <p
                      key={`${current.id}-line-${index}`}
                      className={cn(
                        "rounded-md leading-7 text-charcoal",
                        isQuestionLine && "border border-emerald/20 bg-mint px-4 py-3 text-lg font-black",
                        isInstruction && !isQuestionLine && "bg-ivory px-4 py-3 text-sm font-semibold text-charcoal/75",
                        !isQuestionLine && !isInstruction && "text-base font-medium",
                      )}
                    >
                      {line}
                    </p>
                  );
                })}
              </div>
            )}

            {current.figure && (
              <div className="my-6 rounded-md border border-navy/10 bg-white p-3">
                <div className="mb-2 flex items-center justify-between text-sm font-black text-charcoal">
                  <span>Diagram</span>
                  {paper.resourceUrl && (
                    <Link href={paper.resourceUrl} className="text-emerald" target="_blank">
                      Open PDF
                    </Link>
                  )}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.figure} alt={`Diagram for question ${current.number}`} className="max-h-[720px] w-full rounded-md object-contain" />
              </div>
            )}

            {current.options.length > 0 ? (
              <div className="mt-6 grid gap-3">
                {current.options.map((option, index) => {
                  const isSelected = selectedAnswer === index;
                  const isCorrect = mode === "review" && current.answer === index;
                  const isWrongSelection = mode === "review" && isSelected && current.answer !== null && current.answer !== index;
                  return (
                    <button
                      key={`${current.id}-${index}-${option}`}
                      onClick={() => chooseAnswer(index)}
                      className={cn(
                        "flex min-h-14 w-full items-start gap-4 rounded-md border px-4 py-4 text-left font-bold transition md:px-5",
                        mode === "attempt" && isSelected && "border-emerald bg-mint text-emerald",
                        mode === "attempt" && !isSelected && "border-navy/10 bg-white text-charcoal hover:border-emerald/40",
                        mode === "review" && "cursor-default",
                        mode === "review" && isCorrect && "border-emerald bg-mint text-emerald",
                        mode === "review" && isWrongSelection && "border-red-300 bg-red-50 text-red-700",
                        mode === "review" && !isCorrect && !isWrongSelection && "border-navy/10 bg-white text-charcoal",
                      )}
                      type="button"
                      disabled={mode === "review"}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/25 text-sm">{String.fromCharCode(65 + index)}</span>
                      <span className="min-w-0">{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-md border border-navy/10 bg-ivory p-4">
                <label className="text-sm font-black text-charcoal">{mode === "review" ? "Your Written Response" : "Answer Area"}</label>
                <textarea
                  className="mt-3 min-h-64 w-full resize-y rounded-md border border-navy/10 bg-white p-4 text-base leading-7 outline-none focus:border-emerald disabled:text-charcoal"
                  placeholder="Write your descriptive solution..."
                  value={writtenAnswer}
                  onChange={(event) => updateWrittenAnswer(event.target.value)}
                  disabled={mode === "review"}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-navy/10 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <Link href="/past-papers" className="rounded-md border border-navy/10 bg-white px-5 py-3 text-center text-sm font-black text-charcoal hover:border-emerald/40">
              Save & Exit
            </Link>
            {mode === "attempt" ? (
              <button className="rounded-md border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-600" onClick={clearAnswer} type="button">
                Clear Answer
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:ml-auto sm:flex">
              <button
                className="rounded-md border border-navy/10 bg-white px-5 py-3 text-sm font-black text-charcoal disabled:opacity-40"
                onClick={() => goTo(currentIndex - 1)}
                type="button"
                disabled={!canGoBack}
              >
                Previous
              </button>
              <button
                className="rounded-md bg-emerald px-5 py-3 text-sm font-black text-white disabled:opacity-40"
                onClick={() => goTo(currentIndex + 1)}
                type="button"
                disabled={!canGoNext}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-md border border-navy/10 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase text-charcoal">
              <Icon name="list-checks" className="h-5 w-5 text-emerald" /> Navigator
            </h2>
            <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-10 xl:grid-cols-6">
              {sectionQuestions.map((question, index) => {
                const answered = isAnswered(question, answers, writtenAnswers);
                const isCurrent = question.id === current.id;
                return (
                  <button
                    key={`${question.id}-${index}`}
                    onClick={() => goTo(index)}
                    className={cn(
                      "flex h-10 min-w-0 items-center justify-center rounded-md border text-xs font-black",
                      answered ? "border-emerald bg-emerald text-white" : "border-navy/10 bg-white text-charcoal",
                      isCurrent && "ring-2 ring-emerald ring-offset-2",
                      marked.has(question.id) && "border-gold bg-gold/25 text-charcoal",
                    )}
                    type="button"
                    title={`Question ${displayQuestionNumber(question)}`}
                  >
                    {marked.has(question.id) ? <Icon name="star" className="h-4 w-4" /> : navigatorLabel(question, index)}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "review" ? (
            <div className="rounded-md border border-navy/10 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-charcoal">
                <Icon name="eye" className="h-5 w-5 text-navy" /> Review
              </h2>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <ReviewStat label="Answered" value={`${answeredCount}/${questions.length}`} />
                <ReviewStat label="Scoreable" value={`${correctCount}/${scoreableQuestions.length || 0}`} />
                <ReviewStat label="Marked" value={marked.size.toString()} />
              </div>
              <div className="mt-4 rounded-md bg-ivory p-4">
                <p className="text-sm font-black text-charcoal">Answer key</p>
                {current.options.length > 0 ? (
                  <p className="mt-2 text-sm leading-6 text-charcoal/75">
                    {current.answer !== null ? `Correct answer: ${String.fromCharCode(65 + current.answer)}. ${current.options[current.answer]}` : "The extracted paper does not include a verified answer key for this item yet."}
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-charcoal/75">Use your saved response above against the official PDF or contributor explanation when available.</p>
                )}
                <p className="mt-4 text-sm font-black text-charcoal">Explanation</p>
                <p className="mt-2 text-sm leading-6 text-charcoal/75">{current.solution || "No reviewed explanation is attached to this extracted item yet."}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-navy/10 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase text-charcoal">
                <Icon name="pen" className="h-5 w-5 text-navy" /> Scratchpad
              </h2>
              <textarea
                className="mt-4 min-h-36 w-full resize-y rounded-md border border-navy/10 bg-ivory p-4 text-sm outline-none focus:border-emerald"
                placeholder="Draft a proof, calculate, or note eliminations..."
                value={scratchpad}
                onChange={(event) => setScratchpad(event.target.value)}
              />
            </div>
          )}

          <div className="rounded-md border border-navy/10 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase text-charcoal">
              <Icon name="calculator" className="h-5 w-5 text-emerald" /> Desmos Scientific
            </h2>
            <iframe
              className="mt-4 h-[390px] w-full rounded-md border border-navy/10 bg-white"
              src="https://www.desmos.com/scientific?embed"
              title="Desmos scientific calculator"
              loading="lazy"
            />
          </div>

          {relatedPapers.length > 0 && (
            <div className="rounded-md border border-navy/10 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black uppercase text-charcoal">Related {paper.subject} Papers</h2>
              <div className="mt-4 space-y-2">
                {relatedPapers.map((item) => (
                  <Link key={item.id} href={`/past-papers/${item.id}`} className="block rounded-md border border-navy/10 bg-ivory p-3 text-sm font-bold text-charcoal hover:text-emerald">
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-navy/10 bg-ivory p-3">
      <p className="font-mono text-lg font-black text-charcoal">{value}</p>
      <p className="text-[11px] font-black uppercase text-charcoal/60">{label}</p>
    </div>
  );
}
