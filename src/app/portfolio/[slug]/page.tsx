import fs from "fs";
import path from "path";
import Image from "next/image";

interface CaseData {
  slug: string;
  title: string;
  description: string;
  images: string[];
}

export async function generateStaticParams() {
  const dir = path.join(process.cwd(), "data", "portfolio");
  const files = await fs.promises.readdir(dir);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ slug: f.replace(/\.json$/, "") }));
}

export default function CasePage({
  params,
}: {
  params: { slug: string };
}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "portfolio",
    `${params.slug}.json`
  );
  const raw = fs.readFileSync(filePath, "utf8");
  const data: CaseData = JSON.parse(raw);

  return (
    <article className="p-8">
      <h1 className="text-4xl font-bold mb-4">{data.title}</h1>
      <p className="mb-6">{data.description}</p>
      <div className="space-y-6">
        {data.images.map((src) => (
          <div key={src} className="rounded overflow-hidden">
            <Image
              src={src}
              alt={data.title}
              width={800}
              height={450}
              className="w-full h-auto"
            />
          </div>
        ))}
      </div>
    </article>
  );
}
