import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import mdxRenderer from '@astrojs/mdx/server.js';
import { getCollection, render } from 'astro:content';
import rss from '@astrojs/rss';
import { AUTHOR, BLOG_DESCRIPTION, BLOG_TITLE } from '../consts';

/**
 * Feed readers fetch the XML on its own, so every URL inside the rendered
 * HTML has to be absolute. Relative /_astro/ paths would 404 in a reader.
 */
function absolutise(html, origin) {
	return html
		.replace(/(src|href)="\//g, `$1="${origin}/`)
		.replace(/srcset="([^"]*)"/g, (_m, value) =>
			`srcset="${value.replace(/(^|,\s*)\//g, `$1${origin}/`)}"`,
		);
}

export async function GET(context) {
	const site = context.site;
	const origin = site.href.replace(/\/$/, '');

	const posts = (await getCollection('blog')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);

	const container = await AstroContainer.create();
	container.addServerRenderer({ name: '@astrojs/mdx', renderer: mdxRenderer });

	const items = [];
	for (const post of posts) {
		let content;
		try {
			const { Content } = await render(post);
			content = absolutise(await container.renderToString(Content), origin);
		} catch {
			// If a component can't render standalone, fall back to the summary.
			content = `<p>${post.data.description}</p>`;
		}

		items.push({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/blog/${post.id}/`,
			author: AUTHOR.name,
			categories: [
				...(post.data.category ? [post.data.category] : []),
				...(post.data.tags ?? []),
			],
			content,
		});
	}

	return rss({
		title: BLOG_TITLE,
		description: BLOG_DESCRIPTION,
		site,
		items,
		customData: `<language>en</language><copyright>© ${new Date().getFullYear()} ${AUTHOR.name}</copyright>`,
	});
}
