# Behavioral Spec Derived From a Reference Research Toolkit

Written in my own words from reading the toolkit's READMEs, its supplementary PDF and a behavioral skim of its source. No reference code, names, schemas or layout are reproduced here. This describes what the research does, not how it is written.

Source: the artifact accompanying "The Imitation Game: Exploring Brand Impersonation Attacks on Social Media Platforms" (USENIX Security 2024; Acharya, Lazzaro, Lopez-Morales, Oest, Saad, Cina, Schonherr, Holz).

## 0. License finding

- The archive contains no LICENSE or COPYING file at any level (verified by filename search of the full listing).
- Searching all files for "licen" found no license statement in the READMEs or the dependency manifest. The README gives only a citation request and a contact address.
- Conclusion: no license is granted. Under default copyright, all of its code and data files are treated as OFF-LIMITS for reuse, copying or adaptation in ScamMind AI. Only the ideas and the public algorithms in section 11 may be used, implemented independently.
- The README itself says the toolkit is "not plug-and-play": it needs private API keys, a self-hosted document database and other dependencies.

## 1. The problem

Scammers register social-media accounts whose handle, display name or picture imitates a well-known brand, then use them for fake support, giveaways, crypto/investment fraud, phishing links and similar. The paper asks: how widespread is this on X, Instagram, Telegram and YouTube for the most popular brands, what name tricks do attackers use, what do impersonators post, how do platforms respond when told, and can such accounts be found proactively?

Scope (as reported by the paper): the top 10,000 domains of a public popularity ranking were the brand list. Each domain was reduced to a brand name and, where possible, the brand's official handle on each platform.

## 2. Pipeline overview (stages, inputs, outputs)

1. Brand seed list: ranked domains in; brand names plus official handles out.
2. Candidate discovery per platform: brand-name keywords in; candidate account pools out.
3. Metadata collection: candidate accounts in; profile attributes (creation date, audience and activity counts, bio, verification flag, links, picture) and recent posts out.
4. Name-based (squatting) detection: official handle plus candidate handle in; distance measures and word-split flags, then a category label, out.
5. Profile-picture similarity: candidate pictures plus official logos in; similarity scores and a "which brand does this imitate" verdict out.
6. Post embedding, topic modelling, clustering: post text of impersonating accounts in; clusters of related accounts with keyword summaries out.
7. Scam-type analysis: cluster summaries in; human-assigned attack categories out.
8. Linking/aggregation: statistics per brand, per website category, per platform; joins between brand domains and the handles their own sites link to.
9. Domain status check: brand and linked domains in; reachability status out.
10. Disclosure: per-brand, per-platform lists of squatted profile URLs, grouped by squatting type.
11. Proactive-detection and takedown experiment: generated handles in; alive / suspended / not-found outcomes out.

## 3. Stage details

### 3.1 Brand seed list
Take a popularity-ranked domain list. Derive the brand name from the domain (drop the suffix). Find each brand's genuine accounts, partly by scraping the brand's website for links to its social profiles. Also obtain a website category label per domain from a third-party categorization service so results can be split by industry. Very short or generic brand names cause many false matches; the paper applies a minimum name length when listing top targeted brands.

### 3.2 Candidate account discovery (per platform)
Keyword-driven using the brand name; method differs by platform:
- X: the official search/user-lookup API, then detail and timeline lookups for each hit.
- Instagram and YouTube: third-party scraping/search services queried with the brand name.
- Telegram: no good public search, so browser automation against a public channel directory plus scraping channel pages.
Output is a per-platform pool of accounts whose handle or name relates to the brand, with the brand's own accounts removed.

### 3.3 Metadata collection
For every candidate: creation date (where exposed), audience size, activity counts, verified flag, bio, external links, picture and recent posts. These feed descriptive analysis (account age, follower and post statistics) and the image and text stages. Posts are stored per account.

### 3.4 Squatting / name-based detection
Compare the official handle with each candidate handle (lower-cased) using three measures:
1. Edit distance: a Damerau-Levenshtein style distance (insert, delete, substitute, adjacent swap), with normalised variants also kept.
2. Word splitting: the candidate handle is segmented into likely words with a word-frequency segmenter; the brand is "present" if it is one of the words. The remaining words are the "extra part".
3. Exclusions: handles that are themselves legitimate (other brands' official accounts, names matching other well-known domains from a much larger ranking) are removed so a brand does not match an unrelated legitimate company.

Categories recognised:
- Typosquatting: edit distance exactly 1 from the official handle.
- Combosquatting: brand appears as a whole word plus extra words or digits (support, official, giveaway, numbers). The extra part is further classed as digits only, an ordinary English dictionary word, or other (abbreviations, non-words, mixed).
- Fuzzy squatting: brand not present as a whole word, but edit distance at most 2 (multiple typos, look-alike swaps, separators).
Extras shorter than two characters are ignored for combo statistics. Disclosure lists remove typosquat hits from the combo list to avoid double counting.

How the paper evaluates: counts of brands and accounts per category per platform; most frequent extra words; split of extras into digit/dictionary/other; squatting per website category; top targeted brands; manual inspection of samples; account-age and audience comparisons across categories.

### 3.5 Profile-picture / image similarity
- Build a library of official logos (paper: 2,484) and gather candidate profile pictures (paper: about 219 thousand across four platforms).
- Embed images with a CLIP-style image encoder (several encoder variants were tried); optional downscale first.
- Compare each candidate picture with every logo by cosine similarity (scaled 0-100 in the toolkit); take the nearest logo.
- Acceptance threshold 0.80: at or above means "impersonates that brand", below means "miscellaneous". The paper chose the strict value to limit false positives and shows 0.75 finds more accounts but adds false positives. Causes of lower scores for true impersonators: low resolution, outdated logos, altered logos.
- Paper facts (supplementary Table 2), accounts matched at 0.80 / 0.75: Instagram 1,068 / 2,235 of 36,803; Telegram 4,105 / 6,735 of 55,758; X 4,265 / 15,825 of 102,360; YouTube 38 / 79 of 24,544.

### 3.6 Post text embedding, topic modelling, clustering
- Posts of impersonating accounts are embedded with a general sentence-embedding model (an MPNet-family sentence transformer in the shown configuration).
- A topic-modelling pipeline (embedding, dimensionality reduction, density clustering, keyword extraction) groups the posts. Paper settings: reduce to 5 dimensions, 15 neighbours, min distance 0, cosine metric, fixed seed 42; density clustering min cluster size 10 and min samples 50 (raised to reduce cluster count), Euclidean metric; outlier reassignment; English stop-words removed, uni- and bigrams; keyword selection balancing relevance and diversity (0.8) with part-of-speech filtering. Quality judged by silhouette score plus visual inspection.
- k-means, agglomerative and fast community clustering, and PCA/t-SNE/UMAP projections exist as side experiments.
- Paper result: 543 clusters, no singletons, sizes 57 to 9,713 (median 370). The top 100 clusters (sizes 72 to 3,236) were manually reviewed to derive the top attack categories.

### 3.7 Scam-type / attack analysis
Humans read cluster keywords and sample posts and assign categories (fake support, giveaways/prizes, crypto wallet recovery and investment, fake sales/vouchers, pirated or free-service offers, and so on). The supplementary shows example impersonators of streaming, e-commerce, hardware, crypto-wallet and exchange brands.

### 3.8 Graph / linking of accounts
Despite the name of its plotting module, no network-graph algorithm is used. Linking is done via: (a) the brand website's links to its official profiles; (b) grouping impersonators by the brand imitated and by text cluster; (c) cross-checking against accounts known to a payment company; (d) charts and tables per category, brand and platform. Cluster membership is the real mechanism for grouping related impersonators.

### 3.9 Domain status checks
A plain HTTPS request is made to each brand or linked domain and the response status stored; failures get a sentinel value and are retried in a second pass. Used to filter dead seeds and describe linked sites.

### 3.10 Disclosure / reporting
Per brand and platform, plain lists of profile URLs are written, split into typo, combo and fuzzy groups, minus the brand's own accounts and any excluded names. These lists are what is sent to brand owners/platforms. The toolkit does not submit reports through platform APIs itself.

### 3.11 Experiment: proactive generation and takedown measurement
- Ten target brands (payments, streaming, automotive, software, crypto exchange, search, social, e-commerce, lodging).
- Generate candidate handles by learning templates from discovered squatted handles (brand replaced by a placeholder), plus random single-character mutations and digit/look-alike substitutions. For combos, keep only templates whose extra word contains a scam-flavoured keyword (service, gift, help, official, pay, free, sales, hub and similar). About 50 candidates per brand per type; reject known handles and those over X's length limit.
- Look each up on X. Outcomes: exists (record verified flag), not found, or forbidden (suspended). Per-brand counts show how often predicted handles are real impersonators and how many are already suspended or absent.
- Repeating the lookup before and after disclosure would measure takedown.

## 4. Algorithms at idea level
- Edit distance handle vs brand: 1 for typo, at most 2 for fuzzy.
- Handle word-splitting then brand-word membership test; inspect the remainder.
- Dictionary / digit / other classification of the remainder.
- Image embedding, nearest-logo cosine similarity, threshold 0.80.
- Sentence embedding, dimensionality reduction, density clustering, keyword summaries per cluster.
- Exclusion lists for legitimate lookalikes.
- Template extraction from known bad handles for proactive generation.

## 5. Parameters (paper facts only)
Typo distance 1; fuzzy up to 2; minimum extra length 2; image threshold 0.80 (0.75 sensitivity); 15 neighbours / 5 components / min distance 0 / cosine; min cluster 10, min samples 50; diversity 0.8; seed 42; ten experiment brands, about 50 handles each; 10,000 domains; four platforms.

## 6. Limitations
- Discovery only sees what platform search returns; accounts with no brand text in the handle are missed unless the picture matches.
- Combo detection depends on the segmenter, which mis-splits non-English or invented words.
- Logo threshold trade-off: strict misses altered logos, loose adds false positives. Generic-word brand names cause false matches.
- Creation dates and some metrics are unavailable on some platforms.
- English-oriented embeddings; multilingual scams may cluster poorly.
- Manual cluster labelling is subjective and does not scale.
- Reliance on paid scrapers and an official API that may change; research-grade, not turnkey.
- Takedown is observed only as suspension, confounded by other detection.

## 7. Ethical notes
- Data is public, but scraping may breach platform terms; ScamMind AI should use official APIs and user-supplied input.
- Generated squatted handles were only looked up, never registered; keep it so.
- Lists may include fan or parody accounts; human review before accusing anyone.
- Minimise and limit retention of personal data in bios and posts.

## 8. What this means for ScamMind AI

Worth building:
- Handle-vs-brand checker: edit distance 1 / 2 plus brand word-split presence, giving typo / combo / fuzzy labels with an explanation.
- Homoglyph and digit-substitution normaliser before comparison.
- Logo/profile-picture similarity against a small curated logo set with a conservative threshold, presented as a risk signal rather than a verdict.
- Combo extra-word scoring: scam-flavoured extras (support, giveaway, refund, help, official) raise risk.
- Embedding and clustering of suspicious messages to group campaigns, with keyword labels for analysts.
- Allow-lists for legitimate lookalikes and the brand's own accounts.
- Plain export for a brand owner or platform.

Skip or defer:
- Bulk crawling of four platforms, paid scrapers, heavy database stack.
- Large-scale proactive handle generation.
- Takedown-measurement experiments (long-running monitoring).
- Ranking-wide brand seeding; start with a small brand list.

Differences: the research system is batch, offline and analyst-driven over millions of accounts; ScamMind AI is interactive and per-case, so it should give single-case explainable scores, avoid scraping and keep user data local. The paper's numbers are results on its own data, not targets; re-tune thresholds on our own labelled data.

## 9. Public algorithms freely implementable (information only)
- Damerau-Levenshtein edit distance.
- Cosine similarity on embeddings; CLIP-style contrastive image encoders (open model releases exist; check each model's own licence).
- Sentence embeddings; density clustering; k-means; agglomerative clustering; PCA, t-SNE, UMAP; topic modelling with keyword extraction; silhouette score.
- Frequency-based word segmentation by dynamic programming.

### Third-party packages the reference relies on (names only; all are on the normal public Python registry)
apify client, scikit-learn, nltk, pymongo, tld, web3, seaborn, pyppeteer, validators, spacy, beautifulsoup4, selenium, webdriver-manager, rstr, cymruwhois, ipwhois, textdistance, wordninja, tweepy, pytube, youtube-search-python, sentence-transformers, hdbscan, umap, dill, bertopic. The image stage additionally uses an open CLIP loader and a conda-style environment file. The manifest lists a package literally named "umap", which on the registry is a different project from the dimensionality-reduction library (umap-learn); verify package names and licences independently before installing. Information only; ScamMind AI should choose and review its own dependencies.
