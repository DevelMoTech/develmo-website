import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hastToReact, markdownToHast, markdownToHtml } from "@/lib/markdown";
import { posts } from "@/lib/posts";

async function render(md: string): Promise<string> {
  return renderToStaticMarkup(hastToReact(await markdownToHast(md)));
}

describe("markdown rendering", () => {
  it("renders the three seeded posts byte-identically to the pre-markdown <p> output", async () => {
    for (const post of posts) {
      // Exactly what src/app/(site)/our-blogs/[slug]/page.tsx rendered before.
      const expected = renderToStaticMarkup(createElement(Fragment, null, ...post.body.map((para, i) => createElement("p", { key: i }, para))));
      expect(await render(post.body.join("\n\n"))).toBe(expected);
    }
  });

  it("supports the CommonMark blocks an editor will use", async () => {
    const html = await render("## Heading\n\nSome *emphasis* and **strong** with a [link](https://example.com).\n\n- one\n- two\n\n```js\nconst x = 1;\n```");
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain('<code class="language-js">');
  });

  it("strips scripts, event handlers and javascript: URLs", async () => {
    const html = await render(`<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src="x" onerror="alert(1)">\n\n<a href="https://ok.example" onclick="x()">ok</a>`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("drops raw HTML and escapes text the way React does", async () => {
    const html = await render("Fitting AI <b>starts</b> with the outcome & the data. 1 < 2");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&amp; the data. 1 &lt; 2");
  });

  it("keeps site-relative and https images with alt text", async () => {
    const html = await render("![A camera](/media/0123456789abcdef0123456789abcdef.jpg)");
    expect(html).toContain('<img src="/media/0123456789abcdef0123456789abcdef.jpg" alt="A camera" loading="lazy" decoding="async"/>');
  });

  it("produces the same sanitized structure as HTML for the live preview", async () => {
    const html = await markdownToHtml("# T\n\n<iframe src='https://x'></iframe>\n\nText");
    expect(html).toContain("<h1>T</h1>");
    expect(html).not.toContain("iframe");
    expect(html).toContain("<p>Text</p>");
  });
});
