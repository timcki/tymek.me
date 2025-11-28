# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static personal website built with [Zola](https://www.getzola.org/) static site generator using the [Serene theme](https://github.com/isunjn/serene). The site includes a home page, blog section, and about page with support for dark/light mode.

## Common Commands

### Development
```bash
# serve with live reload on http://localhost:1111
zola serve
# or use the wrapper script
./serve.sh

# build static site to public/ directory
zola build

# check for errors without building
zola check
```

### Alternative Serving Options
```bash
# using Caddy (if installed) - serves on http://localhost:2015
caddy run

# using Python HTTP server
cd public && python3 -m http.server 2015
```

## Content Structure

### Adding Blog Posts
Create markdown files in `content/posts/` with frontmatter:

```markdown
+++
title = "Post Title"
date = 2025-01-20
description = "Brief description"
draft = false

[taxonomies]
tags = ["tag1", "tag2"]
categories = ["category"]

[extra]
toc = true              # show table of contents
comment = false         # enable giscus comments
copy = true             # code block copy button
math = false            # KaTeX math rendering
mermaid = false         # Mermaid chart rendering
featured = false        # asterisk mark in listing
outdate_alert = false   # show freshness warning
+++

Content here...
```

### Content Pages
- **Home**: `content/_index.md` (uses `home.html` template)
- **Blog section**: `content/posts/_index.md` (uses `blog.html` template)
- **About**: `content/about.md` (uses `prose.html` template)

Blog section-level settings in `content/posts/_index.md` apply as defaults to all posts unless overridden.

## Configuration

### Main Config
`config.toml` controls:
- Site metadata (`base_url`, `title`, `description`)
- Theme selection (`theme = "serene"`)
- Navigation sections via `[extra.sections]`
- RSS feed generation (`generate_feeds`, `feed_filenames`)
- Code highlighting themes (`highlight_themes_css`)
- Blog section path (`blog_section_path`)

### Theme Customization
The Serene theme is included as a git submodule at `themes/serene/`.

To customize:
1. Copy files from `themes/serene/templates/` to `myblog/templates/` (e.g., `_custom_css.html` for style variables)
2. Copy from `themes/serene/static/` to `myblog/static/` to override assets
3. Never modify files directly in `themes/serene/` - they'll be overwritten on updates

Key customization files:
- `templates/_custom_css.html` - CSS variables (colors, fonts)
- `templates/_custom_font.html` - Custom font links
- `templates/_head_extend.html` - Analytics scripts
- `templates/_giscus_script.html` - Comment system config

### Code Highlighting
Currently uses dual themes: `serene-light` and `serene-dark` (modified Tomorrow theme). Configured via:
- `highlight_theme = "css"`
- `extra_syntaxes_and_themes = ["themes/serene/highlight_themes"]`
- `highlight_themes_css` generates `hl-light.css` and `hl-dark.css`

### RSS Feeds
Feed generated at `/posts/feed.xml` (set in blog section `_index.md` with `generate_feeds = true`).
Root-level `config.toml` has `generate_feeds = true` and `feed_filenames = ["feed.xml"]`.

## Serene Theme Features

### Shortcodes
- `{{ figure(src="", alt="", caption="", width="", height="") }}` - images with captions
- `{% quote(cite="") %}...{% end %}` - styled quote blocks
- `{% detail(title="", default_open=false) %}...{% end %}` - expandable sections
- `{% note(title="") %}...{% end %}` - callouts (also: `tip`, `important`, `warning`, `caution`)
- `{% mermaid() %}...{% end %}` - Mermaid diagrams
- `{{ collection(file="items.toml") }}` - render collections (projects, bookmarks, etc.)

### Collection Types
For creating showcase pages (projects, publications, etc.):
- `card`, `card_simple` - detailed content blocks
- `entry` - simple list items
- `box` - title/subtitle boxes
- `art`, `art_simple` - image-focused displays

See `themes/serene/USAGE.md` for detailed collection configuration.

## Architecture Notes

### Template Hierarchy
- `home.html` - landing page with bio and recent posts
- `blog.html` - post listing page
- `post.html` - individual blog post
- `prose.html` - generic content page (used for about, custom sections)

### Static Assets
- `static/img/` - favicon files, avatar
- `static/icon/` - custom SVG icons (override theme defaults)
- `static/font/` - self-hosted fonts (optional)

### Theme Toggle
Light/dark mode toggle enabled by default. Force specific mode with `force_theme` in `config.toml`.

## Git Submodule (Theme)

Theme is tracked as a submodule:
```bash
# initialize after clone
git submodule update --init --recursive

# update theme to latest
git submodule update --remote themes/serene
```

Check `themes/serene/CHANGELOG.md` before updating for breaking changes.

## Date Format

Default: `%b %-d, %Y` (e.g., "Jan 15, 2025")
Configurable in section `_index.md` files via `date_format`.
See [chrono strftime docs](https://docs.rs/chrono/latest/chrono/format/strftime/index.html) for format codes.
