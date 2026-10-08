import { ChevronDown } from "lucide-react";

type Faq = { question: string; answer: string };
type Section = { title: string; items: Faq[] };

const sections: Section[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "What is Fairway Studio?",
        answer:
          "Fairway Studio is JL Influence's golf-first creative workspace. It is where Jafar and Liz collect ideas, shape projects, review drafts, and keep brand assets in one shared place.",
      },
      {
        question: "How do I replay the onboarding guide?",
        answer:
          "Scroll to the footer on any studio page and choose Replay onboarding. The guide opens at the top of the page and picks up where you left off, or you can choose a new goal and run the walkthrough again.",
      },
      {
        question: "Do I need an account?",
        answer:
          "The demo studio works without signing in so you can explore. Your own workspace requires signing in so projects, reviews, and drafts are saved to your account.",
      },
    ],
  },
  {
    title: "Projects and reviews",
    items: [
      {
        question: "How are projects organised?",
        answer:
          "Each workspace holds projects. A project groups its ideas, generated drafts, reviews, and decisions so the whole story of a piece of work stays together.",
      },
      {
        question: "Can both of us edit at the same time?",
        answer:
          "Yes. Changes sync to the shared workspace, and the collaboration panel shows who is active and what has changed recently.",
      },
      {
        question: "What happens when I approve or decline a draft?",
        answer:
          "Decisions are recorded on the project with who made them and when. Declined drafts stay available for reference; approved drafts move forward in the project flow.",
      },
    ],
  },
  {
    title: "Saving, offline, and installing",
    items: [
      {
        question: "Does my work save automatically?",
        answer:
          "Edits made while online save to the workspace. When you are offline, ideas and notes are kept as device drafts and you can send them to the workspace once you reconnect.",
      },
      {
        question: "Where are device drafts stored?",
        answer:
          "Device drafts live in your browser's storage for this account and workspace only. Browsers can clear that storage, so export any important unsynced text from the Device drafts panel.",
      },
      {
        question: "How do I install Fairway Studio on my phone or desktop?",
        answer:
          "On iPhone or iPad, open the site in Safari, tap Share, then Add to Home Screen. On Windows, choose Download for Windows in the footer and run the installer, or use Install Studio when your browser offers it. Other browsers list Install app or Add to Home Screen in their menu.",
      },
      {
        question: "I see an \u201cUpdate ready\u201d button. What does it do?",
        answer:
          "A new version of the studio has downloaded. Save or export any open edits first, then choose Update ready to reload into the latest version.",
      },
    ],
  },
  {
    title: "Brand and AI",
    items: [
      {
        question: "Where do the brand colours and logos come from?",
        answer:
          "The Brand Kit holds JL Influence's approved logos, colours, and type. Generated drafts reference it so new work stays on brand.",
      },
      {
        question: "Is AI generation required?",
        answer:
          "No. AI is an assistant for first drafts and variations. You can always start from your own ideas and skip generation entirely.",
      },
    ],
  },
];

export function FaqList() {
  return (
    <div className="flex flex-col gap-10">
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={slug(section.title)} className="flex flex-col gap-3">
          <h2 id={slug(section.title)} className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {section.title}
          </h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {section.items.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium leading-snug [&::-webkit-details-marker]:hidden">
                  <span className="text-pretty">{item.question}</span>
                  <ChevronDown
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="px-5 pb-5 text-pretty text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function slug(value: string) {
  return `faq-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
