import { PageHero } from "@/components/sections/common";

export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <PageHero
      title="About Pakistan Olympiads"
      subtitle="An open-source, community-driven foundation for students preparing for NSTC and international science olympiads."
    />
  );
}
