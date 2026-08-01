import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The corpus is every .kofun source the language repository accepts, so it
// lives there rather than here. This grammar used to sit inside that
// repository and reached it with "../..", which after the split resolves to
// whatever directory the checkout happens to sit in. hjosugi/kofun is pinned
// as a submodule instead, so the corpus is a known revision rather than
// whatever is next to the clone.
const repositoryRoot = process.env.KOFUN_CHECKOUT
  ? resolve(process.env.KOFUN_CHECKOUT)
  : join(packageDirectory, "vendor", "kofun");

if (!existsSync(join(repositoryRoot, "examples"))) {
  throw new Error(
    `no Kofun corpus at ${repositoryRoot}\n`
    + "  git submodule update --init vendor/kofun\n"
    + "or point KOFUN_CHECKOUT at a checkout of hjosugi/kofun.",
  );
}

const corpusRoots = [
  join(repositoryRoot, "examples"),
  join(repositoryRoot, "tests", "kofun"),
];

const files = corpusRoots
  .flatMap((root) => collectKofunFiles(root))
  .sort();

if (files.length === 0) {
  throw new Error(`repository corpus is empty under ${repositoryRoot}`);
}

const result = spawnSync(
  "tree-sitter",
  ["parse", "--quiet", ...files],
  {
    cwd: packageDirectory,
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

if (/\b(?:ERROR|MISSING)\b/.test(result.stdout)) {
  process.stderr.write(result.stdout);
  throw new Error("repository corpus contains parse errors");
}

console.log(`parsed ${files.length} repository Kofun files without errors`);

function collectKofunFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectKofunFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".kofun")
      ? [path]
      : [];
  });
}
