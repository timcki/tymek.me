# Personal Site - Zola POC

A simple personal website built with Zola static site generator using the Serene theme.

## Features

- Home page with personal bio and recent posts
- Blog section with individual post pages
- About page
- Clean, modern design with dark/light mode support (Serene theme)
- Fast static site generation with Zola
- RSS feed generation

## Prerequisites

- [Zola](https://www.getzola.org/) - Static site generator
- Git (for cloning the theme)

### Installing Zola

#### Using Cargo (Rust package manager)

```bash
cargo install --git https://github.com/getzola/zola.git
```

#### Using package managers

```bash
# On macOS
brew install zola

# On Ubuntu/Debian
sudo apt install zola

# Or download from https://github.com/getzola/zola/releases
```

## Setup

### Clone the Serene theme

The Serene theme is included as a Git submodule. To initialize it:

```bash
cd personal_site
git submodule update --init --recursive
```

Or if cloning this repo for the first time:

```bash
git clone --recursive <repo-url>
```

## Usage

### Build the site

```bash
zola build
```

This will generate the static site in the `public` directory.

### Serve the site

**Option 1: Using Zola's development server (recommended)**

```bash
./serve.sh
# or
zola serve
```

The site will be available at http://localhost:1111 with automatic reloading.

**Option 2: Using Caddy (if installed)**

```bash
caddy run
```

The site will be available at http://localhost:2015

**Option 3: Using Python HTTP server**

```bash
cd public && python3 -m http.server 2015
```

## Project Structure

```
personal_site/
├── config.toml          # Zola and theme configuration
├── content/             # All content
│   ├── _index.md        # Home page
│   ├── about.md         # About page
│   └── posts/           # Blog posts
│       ├── _index.md    # Blog section config
│       └── *.md         # Individual blog posts
├── static/              # Static assets
├── themes/              # Zola themes
│   └── serene/          # Serene theme
├── Caddyfile           # Caddy server configuration
├── serve.sh            # Development server script
└── public/             # Generated static site (after build)
```

## Adding New Posts

Create a new Markdown file in the `content/posts/` directory with frontmatter:

```markdown
+++
title = "Your Post Title"
date = 2025-01-20
description = "A brief description of your post"
+++

Your content here...
```

Then rebuild the site with `zola build` or let `zola serve` auto-rebuild.

## Customization

### Theme Configuration

Edit `config.toml` to customize:
- Site title, description, base URL
- Theme settings (colors, fonts, etc.)
- Navigation sections
- Footer copyright
- And more

### Content Customization

- Edit `content/_index.md` to modify the home page
- Edit `content/about.md` to update the about page
- Modify individual posts in `content/posts/`

### Theme Customization

The Serene theme supports extensive customization. See `themes/serene/USAGE.md` for details on:
- Custom CSS
- Custom fonts
- Comment systems (Giscus)
- Table of contents
- Syntax highlighting themes
- And more

## Theme Info

This site uses the [Serene theme](https://github.com/isunjn/serene) by isunjn.

- Clean, minimalist design
- Dark/light mode support
- Responsive layout
- Code syntax highlighting
- Table of contents
- Back to top button
- And more features

## Deployment

You can deploy the generated `public` directory to any static hosting service:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Or any web server

Just run `zola build` and upload the `public` directory.
