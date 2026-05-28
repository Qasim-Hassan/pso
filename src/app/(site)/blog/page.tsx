import { BlogCard } from "@/components/sections/cards";
import { Container, PageHero, SectionTitle } from "@/components/sections/common";
import { getPublishedBlogPosts } from "@/lib/public-content";

export const metadata = {
  title: "Blog",
};

export default async function BlogPage() {
  const blogPosts = await getPublishedBlogPosts();

  return (
    <>
      <PageHero
        title="Blog"
        subtitle="Video-backed essays from Pakistani Olympiad alumni sharing the routes, habits, and mindset that took them to MIT."
        variant="blog"
      />
      <section className="py-10">
        <Container>
          <SectionTitle title="Latest posts" copy="Video-backed essays from Pakistani Olympiad alumni sharing the routes, habits, and mindset that took them to MIT." />
          <div className="grid gap-5 lg:grid-cols-2">
            {blogPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
