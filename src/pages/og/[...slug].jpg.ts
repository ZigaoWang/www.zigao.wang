import type { APIRoute } from 'astro';
import type { ImageMetadata } from 'astro';
import { getCollection } from 'astro:content';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_RATIO = OG_WIDTH / OG_HEIGHT; // 1.905
const BG = { r: 12, g: 12, b: 12 }; // matches --bg

/**
 * Astro's ImageMetadata doesn't expose the source path, so map each imported
 * image back to its file on disk by matching the hashed `src`.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
	'/src/assets/**/*.{jpg,jpeg,png,webp,avif}',
	{ eager: true },
);
const srcToPath = new Map<string, string>(
	Object.entries(modules).map(([file, mod]) => [mod.default.src, file]),
);

export async function getStaticPaths() {
	const posts = await getCollection('blog');
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { heroImage: post.data.heroImage },
	}));
}

export const GET: APIRoute = async ({ props }) => {
	const hero = props.heroImage as ImageMetadata | undefined;
	const file = hero ? srcToPath.get(hero.src) : undefined;

	if (!hero || !file) {
		// No usable source: emit a plain background card rather than 404.
		const blank = await sharp({
			create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: BG },
		})
			.jpeg({ quality: 82 })
			.toBuffer();
		return new Response(new Uint8Array(blank), {
			headers: { 'Content-Type': 'image/jpeg' },
		});
	}

	const buf = await fs.readFile(path.join(process.cwd(), file.replace(/^\//, '')));
	const ratio = hero.width / hero.height;

	let out: Buffer;
	if (ratio >= OG_RATIO * 0.75) {
		// Wide enough to fill the card, so crop to fit.
		out = await sharp(buf)
			.resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
			.jpeg({ quality: 82, mozjpeg: true })
			.toBuffer();
	} else {
		// Portrait (book covers): letterbox over a blurred fill of itself, so
		// the card is always 1200x630 without stretching or cropping the art.
		const background = await sharp(buf)
			.resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' })
			.blur(40)
			.modulate({ brightness: 0.45 })
			.toBuffer();
		const foreground = await sharp(buf)
			.resize(OG_WIDTH, OG_HEIGHT, { fit: 'inside', withoutEnlargement: false })
			.toBuffer();
		out = await sharp(background)
			.composite([{ input: foreground, gravity: 'center' }])
			.jpeg({ quality: 82, mozjpeg: true })
			.toBuffer();
	}

	return new Response(new Uint8Array(out), {
		headers: { 'Content-Type': 'image/jpeg' },
	});
};
