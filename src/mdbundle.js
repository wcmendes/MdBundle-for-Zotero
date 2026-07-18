MdBundle = {
	id: null,
	version: null,
	rootURI: null,
	initialized: false,
	addedElementIDs: [],

	init({ id, version, rootURI }) {
		if (this.initialized) return;
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		this.initialized = true;
	},

	log(msg) {
		Zotero.debug("MdBundle: " + msg);
	},

	getString(key) {
		try {
			return Zotero.Intl.strings['mdbundle-' + key]
				|| Zotero.getString('mdbundle-' + key)
				|| key;
		} catch(e) {
			return key;
		}
	},

	// Simple i18n lookup from bundled strings
	l(key) {
		return this._strings[key] || key;
	},

	_strings: {},

	async loadStrings() {
		// Detect locale and load appropriate strings
		let locale = Zotero.locale || 'en-US';
		let supported = ['en-US', 'pt-BR', 'es-ES', 'zh-CN', 'it-IT', 'fr-FR', 'de-DE', 'ja-JP', 'ko-KR', 'ru-RU', 'pl-PL', 'tr-TR'];
		if (!supported.includes(locale)) {
			if (locale.startsWith('pt')) locale = 'pt-BR';
			else if (locale.startsWith('es')) locale = 'es-ES';
			else if (locale.startsWith('zh')) locale = 'zh-CN';
			else if (locale.startsWith('it')) locale = 'it-IT';
			else if (locale.startsWith('fr')) locale = 'fr-FR';
			else if (locale.startsWith('de')) locale = 'de-DE';
			else if (locale.startsWith('ja')) locale = 'ja-JP';
			else if (locale.startsWith('ko')) locale = 'ko-KR';
			else if (locale.startsWith('ru')) locale = 'ru-RU';
			else if (locale.startsWith('pl')) locale = 'pl-PL';
			else if (locale.startsWith('tr')) locale = 'tr-TR';
			else locale = 'en-US';
		}

		let path = this.rootURI + `locale/${locale}/mdbundle.ftl`;
		try {
			let content = await Zotero.File.getContentsFromURLAsync(path);
			// Parse simple FTL format: key = value
			for (let line of content.split('\n')) {
				line = line.trim();
				if (!line || line.startsWith('#')) continue;
				let eqIdx = line.indexOf(' = ');
				if (eqIdx < 0) continue;
				let k = line.substring(0, eqIdx).trim();
				let v = line.substring(eqIdx + 3).trim();
				this._strings[k] = v;
			}
		} catch(e) {
			this.log(`Failed to load locale ${locale}: ${e.message}`);
		}
	},

	s(key, vars) {
		let str = this._strings[key] || key;
		if (vars) {
			for (let [k, v] of Object.entries(vars)) {
				str = str.replace(new RegExp(`\\{\\s*\\$${k}\\s*\\}`, 'g'), v);
			}
		}
		return str;
	},

	addToWindow(window) {
		let doc = window.document;

		let menu = doc.createXULElement('menu');
		menu.id = 'mdbundle-menu';
		menu.setAttribute('label', this.s('mdbundle-menu-label'));

		let menupopup = doc.createXULElement('menupopup');
		menupopup.id = 'mdbundle-menupopup';

		let items = [
			{ id: 'mdbundle-all', label: 'mdbundle-export-all', cmd: () => MdBundle.exportSelected(window, 'all') },
			{ id: 'mdbundle-pdf', label: 'mdbundle-export-pdf', cmd: () => MdBundle.exportSelected(window, 'pdf') },
			{ id: 'mdbundle-md', label: 'mdbundle-export-md', cmd: () => MdBundle.exportSelected(window, 'md') },
			{ id: 'mdbundle-sep1', sep: true },
			{ id: 'mdbundle-analyze', label: 'mdbundle-analyze', cmd: () => MdBundle.analyzeItems(window) },
			{ id: 'mdbundle-sep2', sep: true },
			{ id: 'mdbundle-gen', label: 'mdbundle-gen-md', cmd: () => MdBundle.generateMds(window) },
		];

		for (let it of items) {
			if (it.sep) {
				let sep = doc.createXULElement('menuseparator');
				sep.id = it.id;
				menupopup.appendChild(sep);
			} else {
				let mi = doc.createXULElement('menuitem');
				mi.id = it.id;
				mi.setAttribute('label', this.s(it.label));
				mi.addEventListener('command', it.cmd);
				menupopup.appendChild(mi);
			}
		}

		menu.appendChild(menupopup);
		let itemMenu = doc.getElementById('zotero-itemmenu');
		if (itemMenu) {
			itemMenu.appendChild(menu);
			this.addedElementIDs.push(menu.id);
		}

		// Tools menu - submenu like the context menu
		let toolsMenu = doc.getElementById('menu_ToolsPopup');
		if (toolsMenu) {
			let toolsSubmenu = doc.createXULElement('menu');
			toolsSubmenu.id = 'mdbundle-tools-menu';
			toolsSubmenu.setAttribute('label', 'MdBundle');

			let toolsPopup = doc.createXULElement('menupopup');
			toolsPopup.id = 'mdbundle-tools-menupopup';

			let toolsDocx = doc.createXULElement('menuitem');
			toolsDocx.id = 'mdbundle-tools-docx';
			toolsDocx.setAttribute('label', this.s('mdbundle-tools-docx'));
			toolsDocx.addEventListener('command', () => MdBundle.selectFromDocx(window));

			toolsPopup.appendChild(toolsDocx);
			toolsSubmenu.appendChild(toolsPopup);
			toolsMenu.appendChild(toolsSubmenu);
			this.addedElementIDs.push(toolsSubmenu.id);
		}
	},

	addToAllWindows() {
		var windows = Zotero.getMainWindows();
		for (let win of windows) {
			if (!win.ZoteroPane) continue;
			this.addToWindow(win);
		}
	},

	removeFromWindow(window) {
		var doc = window.document;
		for (let id of this.addedElementIDs) {
			doc.getElementById(id)?.remove();
		}
	},

	removeFromAllWindows() {
		var windows = Zotero.getMainWindows();
		for (let win of windows) {
			if (!win.ZoteroPane) continue;
			this.removeFromWindow(win);
		}
	},

	// ─── ANALYZE ────────────────────────────────────────────────────

	async analyzeItems(window) {
		try {
			let selectedItems = window.ZoteroPane.getSelectedItems();
			if (!selectedItems || selectedItems.length === 0) {
				window.alert(this.s('mdbundle-no-selection'));
				return;
			}

			let total = 0, withPdf = 0, withMd = 0, withBoth = 0;
			let noPdfNoMd = [], noMd = [], suspicious = [];

			for (let item of selectedItems) {
				if (item.isAttachment()) continue;
				total++;
				let { pdfFiles, mdFiles } = await this.getAttachmentInfo(item);
				let hasPdf = pdfFiles.length > 0;
				let hasMd = this.hasMatchingMd(pdfFiles, mdFiles);

				if (hasPdf) withPdf++;
				if (hasMd) withMd++;
				if (hasPdf && hasMd) withBoth++;

				let title = item.getField('title') || `(item ${item.id})`;
				if (!hasPdf && !hasMd) noPdfNoMd.push(title);
				else if (hasPdf && !hasMd) noMd.push(title);

				// Check suspicious MDs
				if (hasPdf) {
					for (let pdf of pdfFiles) {
						let pdfBase = this.normalizeName(pdf.fileName.substring(0, pdf.fileName.lastIndexOf('.')));
						let match = mdFiles.find(md => this.normalizeName(md.fileName.substring(0, md.fileName.lastIndexOf('.'))) === pdfBase);
						if (match && match.fileSize < 5120) {
							suspicious.push(`${match.fileName} (${(match.fileSize/1024).toFixed(1)} KB)`);
						}
					}
				}
			}

			let msg = `📊 ${this.s('mdbundle-analyze-title')}\n\n`;
			msg += `${this.s('mdbundle-items-selected')}: ${total}\n`;
			msg += `─────────────────────\n`;
			msg += `✅ ${this.s('mdbundle-with-pdf')}: ${withPdf}\n`;
			msg += `✅ ${this.s('mdbundle-with-md')}: ${withMd}\n`;
			msg += `✅ ${this.s('mdbundle-with-both')}: ${withBoth}\n`;
			msg += `─────────────────────\n`;
			msg += `❌ ${this.s('mdbundle-no-pdf-no-md')}: ${noPdfNoMd.length}\n`;
			msg += `📄 ${this.s('mdbundle-pdf-no-md')}: ${noMd.length}\n`;

			if (suspicious.length > 0) {
				msg += `\n⚠️ ${this.s('mdbundle-suspicious-mds')}: ${suspicious.length}\n`;
				for (let s of suspicious.slice(0, 10)) msg += `  • ${s}\n`;
				if (suspicious.length > 10) msg += `  ${this.s('mdbundle-and-more', {count: suspicious.length - 10})}\n`;
			}
			if (noPdfNoMd.length > 0) {
				msg += `\n❌ ${this.s('mdbundle-no-pdf-no-md')} (${noPdfNoMd.length}):\n`;
				for (let t of noPdfNoMd.slice(0, 8)) msg += `  • ${t.substring(0, 55)}\n`;
				if (noPdfNoMd.length > 8) msg += `  ${this.s('mdbundle-and-more', {count: noPdfNoMd.length - 8})}\n`;
			}
			if (noMd.length > 0) {
				msg += `\n📄 ${this.s('mdbundle-items-pdf-no-md')} (${noMd.length}):\n`;
				for (let t of noMd.slice(0, 8)) msg += `  • ${t.substring(0, 55)}\n`;
				if (noMd.length > 8) msg += `  ${this.s('mdbundle-and-more', {count: noMd.length - 8})}\n`;
			}
			window.alert(msg);
		} catch (e) {
			this.log(`Analyze error: ${e.message}`);
			window.alert(`Error: ${e.message}`);
		}
	},

	// ─── EXPORT ──────────────────────────────────────────────────────

	async exportSelected(window, filter) {
		try {
			let selectedItems = window.ZoteroPane.getSelectedItems();
			if (!selectedItems || selectedItems.length === 0) {
				window.alert(this.s('mdbundle-no-selection'));
				return;
			}
			let destFolder = await this.pickFolder(window);
			if (!destFolder) return;

			let total = 0, pdfCount = 0, mdCount = 0, errorCount = 0;
			let itemsWithPdf = 0, itemsWithMd = 0;
			let itemsNoPdf = [], itemsNoMd = [], suspicious = [];

			for (let item of selectedItems) {
				if (item.isAttachment()) continue;
				total++;
				let { pdfFiles, mdFiles } = await this.getAttachmentInfo(item);
				let exportedPdf = false, exportedMd = false;

				for (let pdf of pdfFiles) {
					let pdfBase = this.normalizeName(pdf.fileName.substring(0, pdf.fileName.lastIndexOf('.')));
					if (filter === 'all' || filter === 'pdf') {
						try {
							let dest = await this.getUniqueFilePath(PathUtils.join(destFolder, pdf.fileName));
							await IOUtils.copy(pdf.filePath, dest);
							pdfCount++; exportedPdf = true;
						} catch(e) { errorCount++; }
					}
					if (filter === 'all' || filter === 'md') {
						let match = mdFiles.find(md => this.normalizeName(md.fileName.substring(0, md.fileName.lastIndexOf('.'))) === pdfBase);
						if (match) {
							try {
								let dest = await this.getUniqueFilePath(PathUtils.join(destFolder, match.fileName));
								await IOUtils.copy(match.filePath, dest);
								mdCount++; exportedMd = true;
								if (match.fileSize < 5120) suspicious.push(`${match.fileName} (${(match.fileSize/1024).toFixed(1)} KB)`);
							} catch(e) { errorCount++; }
						}
					}
				}

				if (exportedPdf) itemsWithPdf++;
				if (exportedMd) itemsWithMd++;
				let title = item.getField('title') || `(item ${item.id})`;
				if ((filter==='all'||filter==='pdf') && !exportedPdf) itemsNoPdf.push(title);
				if ((filter==='all'||filter==='md') && pdfFiles.length > 0 && !exportedMd) itemsNoMd.push(title);
			}

			let totalCopied = pdfCount + mdCount;
			let msg = `${this.s('mdbundle-export-done')}\n\n`;
			msg += `${this.s('mdbundle-items-selected')}: ${total}\n─────────────────────\n`;
			if (filter==='all'||filter==='pdf') msg += `📄 ${this.s('mdbundle-pdfs-exported')}: ${pdfCount} (${this.s('mdbundle-from-items', {count: itemsWithPdf})})\n`;
			if (filter==='all'||filter==='md') msg += `📝 ${this.s('mdbundle-mds-exported')}: ${mdCount} (${this.s('mdbundle-from-items', {count: itemsWithMd})})\n`;
			msg += `─────────────────────\n${this.s('mdbundle-total-files')}: ${totalCopied}\n`;
			if (errorCount > 0) msg += `${this.s('mdbundle-errors')}: ${errorCount}\n`;
			if (suspicious.length > 0) {
				msg += `\n⚠️ ${this.s('mdbundle-suspicious-mds')}:\n`;
				for (let s of suspicious.slice(0, 10)) msg += `  • ${s}\n`;
			}
			if (itemsNoPdf.length > 0 && (filter==='all'||filter==='pdf')) {
				msg += `\n📄 ${this.s('mdbundle-items-no-pdf')} (${itemsNoPdf.length}):\n`;
				for (let t of itemsNoPdf.slice(0, 8)) msg += `  • ${t.substring(0, 55)}\n`;
				if (itemsNoPdf.length > 8) msg += `  ${this.s('mdbundle-and-more', {count: itemsNoPdf.length - 8})}\n`;
			}
			if (itemsNoMd.length > 0 && (filter==='all'||filter==='md')) {
				msg += `\n📝 ${this.s('mdbundle-items-pdf-no-md')} (${itemsNoMd.length}):\n`;
				for (let t of itemsNoMd.slice(0, 8)) msg += `  • ${t.substring(0, 55)}\n`;
				if (itemsNoMd.length > 8) msg += `  ${this.s('mdbundle-and-more', {count: itemsNoMd.length - 8})}\n`;
			}
			msg += `\n${this.s('mdbundle-destination')}: ${destFolder}`;
			window.alert(msg);
		} catch(e) {
			this.log(`Export error: ${e.message}`);
			window.alert(`Error: ${e.message}`);
		}
	},

	// ─── GENERATE MDs ────────────────────────────────────────────────

	async generateMds(window) {
		try {
			let selectedItems = window.ZoteroPane.getSelectedItems();
			if (!selectedItems || selectedItems.length === 0) {
				window.alert(this.s('mdbundle-no-selection'));
				return;
			}

			let total = 0, generated = 0, alreadyHas = 0;
			let noText = [], errors = [];

			for (let item of selectedItems) {
				if (item.isAttachment()) continue;
				total++;
				let { pdfFiles, mdFiles } = await this.getAttachmentInfo(item);
				if (pdfFiles.length === 0) continue;

				let pdf = pdfFiles[0];
				let pdfBase = this.normalizeName(pdf.fileName.substring(0, pdf.fileName.lastIndexOf('.')));
				let hasMd = mdFiles.some(md => this.normalizeName(md.fileName.substring(0, md.fileName.lastIndexOf('.'))) === pdfBase);

				if (hasMd) { alreadyHas++; continue; }

				try {
					let attIDs = item.getAttachments();
					let pdfAtt = null;
					for (let id of attIDs) {
						let att = await Zotero.Items.getAsync(id);
						let fp = await att.getFilePathAsync();
						if (fp === pdf.filePath) { pdfAtt = att; break; }
					}
					if (!pdfAtt) continue;

					let text = await pdfAtt.attachmentText;
					if (!text || text.trim().length < 100) {
						let title = item.getField('title') || `(item ${item.id})`;
						noText.push(title);
						item.addTag('needs-ocr', 0);
						await item.saveTx();
						continue;
					}

					let title = item.getField('title') || pdf.fileName.replace('.pdf','');
					let creators = item.getCreators();
					let authors = creators.map(c => [c.firstName, c.lastName].filter(Boolean).join(' ')).filter(a => a).join(', ');
					let year = item.getField('year') || item.getField('date') || '';

					let mdContent = `# ${title}\n\n`;
					if (authors) mdContent += `**Authors:** ${authors}\n`;
					if (year) mdContent += `**Year:** ${year}\n`;
					mdContent += `\n---\n\n${text}`;

					let pdfDir = PathUtils.parent(pdf.filePath);
					let mdName = pdf.fileName.substring(0, pdf.fileName.lastIndexOf('.')) + '.md';
					let mdPath = PathUtils.join(pdfDir, mdName);

					await Zotero.File.putContentsAsync(mdPath, mdContent);
					await Zotero.Attachments.linkFromFile({
						file: mdPath,
						parentItemID: item.id,
						contentType: 'text/markdown'
					});
					generated++;
				} catch(e) {
					errors.push(item.getField('title') || `(item ${item.id})`);
					this.log(`Gen MD error: ${e.message}`);
				}
			}

			let msg = `${this.s('mdbundle-gen-done')}\n\n`;
			msg += `${this.s('mdbundle-items-selected')}: ${total}\n─────────────────────\n`;
			msg += `✅ ${this.s('mdbundle-gen-generated')}: ${generated}\n`;
			msg += `⏭️ ${this.s('mdbundle-gen-already')}: ${alreadyHas}\n`;
			if (noText.length > 0) {
				msg += `\n⚠️ ${this.s('mdbundle-gen-no-text')} (${noText.length}):\n`;
				for (let t of noText.slice(0, 10)) msg += `  • ${t.substring(0, 55)}\n`;
				if (noText.length > 10) msg += `  ${this.s('mdbundle-and-more', {count: noText.length - 10})}\n`;
				msg += `\n🏷️ ${this.s('mdbundle-gen-tagged')}\n`;
			}
			if (errors.length > 0) {
				msg += `\n❌ ${this.s('mdbundle-gen-errors')} (${errors.length}):\n`;
				for (let t of errors.slice(0, 5)) msg += `  • ${t.substring(0, 55)}\n`;
			}
			window.alert(msg);
		} catch(e) {
			this.log(`Generate error: ${e.message}`);
			window.alert(`Error: ${e.message}`);
		}
	},

	// ─── SELECT FROM DOCX ────────────────────────────────────────────

	async selectFromDocx(window) {
		try {
			let docxPath = await this.pickFile(window);
			if (!docxPath) return;

			let citations = await this.extractCitationsFromDocx(docxPath);
			if (citations.length === 0) {
				window.alert(`${this.s('mdbundle-docx-no-citations')}\n\n${this.s('mdbundle-docx-check')}`);
				return;
			}

			let found = [], notFound = [];
			let foundItemIDs = new Set();
			for (let cit of citations) {
				let item = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, cit.key);

				// If found by key, verify it has attachments; if not, try title search
				if (item && item.getAttachments().length > 0) {
					if (!foundItemIDs.has(item.id)) {
						foundItemIDs.add(item.id);
						found.push(item);
					}
				} else {
					// Fallback: search by title from citation data
					let titleMatch = null;
					if (cit.title) {
						let s = new Zotero.Search();
						s.libraryID = Zotero.Libraries.userLibraryID;
						s.addCondition('title', 'is', cit.title);
						let ids = await s.search();
						if (ids.length > 0) {
							for (let id of ids) {
								let candidate = await Zotero.Items.getAsync(id);
								if (candidate && !candidate.isAttachment() && !foundItemIDs.has(candidate.id)) {
									titleMatch = candidate;
									break;
								}
							}
						}
					}
					if (titleMatch) {
						foundItemIDs.add(titleMatch.id);
						found.push(titleMatch);
					} else {
						notFound.push(cit);
					}
				}
			}

			if (found.length === 0) {
				let msg = `${this.s('mdbundle-docx-not-found')} (${citations.length}):\n`;
				for (let c of notFound.slice(0, 15)) msg += `  • ${c.label}\n`;
				window.alert(msg);
				return;
			}

			await window.ZoteroPane.selectItems(found.map(i => i.id));

			// Analyze attachment status only of the selected items
			let withPdf = 0, withMd = 0, noFilesList = [];
			for (let item of found) {
				let { pdfFiles, mdFiles } = await this.getAttachmentInfo(item);
				let hasPdf = pdfFiles.length > 0;
				let hasMd = this.hasMatchingMd(pdfFiles, mdFiles);
				if (hasPdf) withPdf++;
				if (hasMd) withMd++;
				if (!hasPdf) {
					noFilesList.push(item.getField('title') || `(item ${item.id})`);
				}
			}

			let msg = `${this.s('mdbundle-docx-success')}\n\n`;
			msg += `${this.s('mdbundle-docx-citations')}: ${citations.length}\n`;
			msg += `${this.s('mdbundle-docx-found')}: ${found.length}\n`;
			msg += `\n📊 ${this.s('mdbundle-docx-found')}:\n`;
			msg += `  ✅ ${this.s('mdbundle-with-pdf')}: ${withPdf}\n`;
			msg += `  ✅ ${this.s('mdbundle-with-md')}: ${withMd}\n`;
			if (noFilesList.length > 0) {
				msg += `  📄 ${this.s('mdbundle-items-no-pdf')}: ${noFilesList.length}\n`;
				for (let t of noFilesList.slice(0, 5)) msg += `     • ${t.substring(0, 55)}\n`;
				if (noFilesList.length > 5) msg += `     ${this.s('mdbundle-and-more', {count: noFilesList.length - 5})}\n`;
			}
			if (notFound.length > 0) {
				msg += `\n⚠️ ${this.s('mdbundle-docx-not-found')} (${notFound.length}):\n`;
				for (let c of notFound.slice(0, 15)) msg += `  • ${c.label}\n`;
				if (notFound.length > 15) msg += `  ${this.s('mdbundle-and-more', {count: notFound.length - 15})}\n`;
			}
			msg += `\n${this.s('mdbundle-docx-next')}`;
			window.alert(msg);
		} catch(e) {
			this.log(`Docx error: ${e.message}`);
			window.alert(`Error: ${e.message}`);
		}
	},

	async extractCitationsFromDocx(docxPath) {
		let citationsMap = new Map();
		let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
		let file = Zotero.File.pathToFile(docxPath);
		zipReader.open(file);

		// Read document.xml and footnotes.xml (note-style citations)
		let filesToRead = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
		let allFields = [];

		for (let entryName of filesToRead) {
			if (!zipReader.hasEntry(entryName)) continue;
			let stream = zipReader.getInputStream(entryName);
			let conv = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
			conv.init(stream, "UTF-8", 0, 0);
			let xmlContent = '', str = {}, chunk;
			do { chunk = conv.readString(65536, str); xmlContent += str.value; } while (chunk > 0);
			conv.close(); stream.close();

			// Parse DOM and extract fields properly (like ref-extractor)
			let fields = this.extractFieldsFromXml(xmlContent);
			allFields = allFields.concat(fields);
		}
		zipReader.close();

		// Process fields: only CSL_CITATION fields
		for (let field of allFields) {
			field = field.trim();
			let cslFieldPrefix = /^(ADDIN\s+)?(ZOTERO_ITEM\s+)?CSL_CITATION/;
			if (!cslFieldPrefix.test(field)) continue;

			let jsonStr = field.replace(cslFieldPrefix, '').trim();
			// Remove trailing hash if present (e.g. "} abc123")
			jsonStr = jsonStr.replace(/(\{.+\})\s+[0-9A-Za-z]+$/, '$1');

			try {
				let citation = JSON.parse(jsonStr);
				if (citation.citationItems) {
					for (let ci of citation.citationItems) {
						// Skip citations without itemData (like ref-extractor does)
						if (!ci.itemData) continue;

						let key = null;
						let uris = ci.uris || ci.uri || [];
						for (let uri of uris) {
							let m = uri.match(/\/items\/([A-Z0-9]{8})/);
							if (m) { key = m[1]; break; }
						}
						if (!key) continue;
						// Deduplicate by key
						if (citationsMap.has(key)) continue;

						let label = key;
						let title = ci.itemData?.title || '';
						if (ci.itemData) {
							let d = ci.itemData;
							let auth = d.author?.length ? (d.author[0].family || d.author[0].literal || '') : '';
							if (d.author?.length > 1) auth += ' et al.';
							let yr = d.issued?.['date-parts']?.[0]?.[0] || '';
							let tit = d.title || '';
							if (auth && yr) label = `${auth} (${yr})${tit ? ' - ' + tit.substring(0, 45) : ''}`;
							else if (tit) label = tit.substring(0, 65);
						}
						citationsMap.set(key, { label, title });
					}
				}
			} catch (e) {
				// JSON parse failed — skip this field
				this.log(`Failed to parse citation field: ${e.message}`);
			}
		}

		return [...citationsMap.entries()].map(([key, data]) => ({ key, label: data.label, title: data.title }));
	},

	extractFieldsFromXml(xmlContent) {
		// Properly extract complex field content from Office Open XML
		// Complex fields are delimited by <w:fldChar w:fldCharType="begin"/> and "end"/>
		// The actual content is in <w:instrText> elements between begin and end
		let fields = [];

		// Parse as DOM
		let parser = new DOMParser();
		let doc = parser.parseFromString(xmlContent, 'text/xml');

		// Find all fldChar elements with fldCharType="begin"
		let allElements = doc.getElementsByTagName('*');
		let fldChars = [];
		for (let i = 0; i < allElements.length; i++) {
			let el = allElements[i];
			if (el.localName === 'fldChar') {
				fldChars.push(el);
			}
		}

		// Walk through fldChars to find begin/end pairs
		let i = 0;
		while (i < fldChars.length) {
			let el = fldChars[i];
			let charType = el.getAttribute('w:fldCharType') || el.getAttributeNS(null, 'fldCharType') || '';

			if (charType === 'begin') {
				// Collect instrText content until we hit 'end'
				let instrText = '';
				let depth = 1;
				let run = el.parentElement; // <w:r> containing begin

				if (run) {
					let sibling = run.nextSibling;
					while (sibling && depth > 0) {
						// Check if this sibling contains fldChar
						let fldCharInSibling = sibling.getElementsByTagName('w:fldChar');
						if (fldCharInSibling.length === 0) {
							// Also check without namespace prefix
							fldCharInSibling = [];
							let children = sibling.getElementsByTagName('*');
							for (let c = 0; c < children.length; c++) {
								if (children[c].localName === 'fldChar') {
									fldCharInSibling.push(children[c]);
								}
							}
						}

						for (let fc = 0; fc < fldCharInSibling.length; fc++) {
							let type = fldCharInSibling[fc].getAttribute('w:fldCharType')
								|| fldCharInSibling[fc].getAttributeNS(null, 'fldCharType') || '';
							if (type === 'begin') depth++;
							else if (type === 'end') depth--;
						}

						if (depth > 0) {
							// Collect instrText content
							let instrElements = sibling.getElementsByTagName('w:instrText');
							if (instrElements.length === 0) {
								let children = sibling.getElementsByTagName('*');
								for (let c = 0; c < children.length; c++) {
									if (children[c].localName === 'instrText') {
										instrText += children[c].textContent;
									}
								}
							} else {
								for (let j = 0; j < instrElements.length; j++) {
									instrText += instrElements[j].textContent;
								}
							}
						}

						sibling = sibling.nextSibling;
					}
				}

				if (instrText.length > 0) {
					fields.push(instrText);
				}
			}
			i++;
		}

		return fields;
	},

	// ─── HELPERS ──────────────────────────────────────────────────────

	async getAttachmentInfo(item) {
		let pdfFiles = [], mdFiles = [];
		let attIDs = item.getAttachments();
		for (let attID of attIDs) {
			let att = await Zotero.Items.getAsync(attID);
			if (!att) continue;
			let filePath = await att.getFilePathAsync();
			if (!filePath) continue;
			let file = Zotero.File.pathToFile(filePath);
			if (!file.exists()) continue;
			let fileName = file.leafName;
			let ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
			if (ext === '.pdf') pdfFiles.push({ filePath, fileName, fileSize: file.fileSize });
			else if (ext === '.md') mdFiles.push({ filePath, fileName, fileSize: file.fileSize });
		}
		return { pdfFiles, mdFiles };
	},

	hasMatchingMd(pdfFiles, mdFiles) {
		for (let pdf of pdfFiles) {
			let pdfBase = this.normalizeName(pdf.fileName.substring(0, pdf.fileName.lastIndexOf('.')));
			if (mdFiles.some(md => this.normalizeName(md.fileName.substring(0, md.fileName.lastIndexOf('.'))) === pdfBase)) return true;
		}
		return false;
	},

	normalizeName(str) {
		// Remove accents and normalize for comparison
		return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
	},

	async pickFolder(window) {
		const nsIFilePicker = Ci.nsIFilePicker;
		let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window.browsingContext, this.s('mdbundle-pick-folder'), nsIFilePicker.modeGetFolder);
		let result = await new Promise(r => fp.open(r));
		return result === nsIFilePicker.returnOK ? fp.file.path : null;
	},

	async pickFile(window) {
		const nsIFilePicker = Ci.nsIFilePicker;
		let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window.browsingContext, this.s('mdbundle-pick-docx'), nsIFilePicker.modeOpen);
		fp.appendFilter('Word (.docx)', '*.docx');
		let result = await new Promise(r => fp.open(r));
		return result === nsIFilePicker.returnOK ? fp.file.path : null;
	},

	async getUniqueFilePath(filePath) {
		if (!(await IOUtils.exists(filePath))) return filePath;
		let dir = PathUtils.parent(filePath);
		let fileName = PathUtils.filename(filePath);
		let dotIdx = fileName.lastIndexOf('.');
		let ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
		let base = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
		let counter = 1, newPath;
		do { newPath = PathUtils.join(dir, `${base} (${counter})${ext}`); counter++; }
		while (await IOUtils.exists(newPath));
		return newPath;
	}
};
