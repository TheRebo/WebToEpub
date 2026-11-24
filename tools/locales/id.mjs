/**
 * The Indonesian translations.
 *
 * Each entry is `[message, description]`. A missing key falls back to the
 * English source at build time, so a partial file is still usable.
 */
export default {
    appName: ["Kintsugi", "Nama ekstensi ini."],
    appTagline: [
        "Ubah novel web mana pun menjadi buku yang layak disimpan.",
        "Deskripsi singkat ekstensi ini.",
    ],

    // --- Workbench ---
    workbenchTitle: ["Meja kerja", "Judul halaman utama."],
    workbenchStoryDetails: ["Detail cerita", "Judul panel metadata."],
    workbenchCover: ["Sampul", "Judul bagian sampul."],
    workbenchOptions: ["Pilihan", "Judul bagian opsi."],
    workbenchChapters: ["Bab", "Judul daftar bab."],
    workbenchChaptersFound: ["$COUNT$ bab ditemukan", "Berapa banyak bab yang ditemukan."],
    workbenchChapterCount: [
        "$VISIBLE$ dari $TOTAL$",
        "Berapa banyak bab yang terlihat dari total yang ditemukan.",
    ],
    workbenchPack: ["Buat EPUB", "Tombol untuk menyusun buku."],
    workbenchSave: ["Simpan", "Tombol untuk menyimpan metadata."],
    workbenchCancel: ["Batal", "Tombol untuk menghentikan unduhan."],
    workbenchSelectAll: ["Pilih semua", "Tombol untuk memilih semua bab."],
    workbenchSelectNone: ["Batalkan semua", "Tombol untuk membatalkan pilihan semua bab."],
    workbenchInvert: ["Balik", "Tombol untuk membalik pilihan."],
    workbenchRanges: ["Rentang", "Tombol untuk memilih rentang bab."],
    workbenchFilter: ["Saring", "Tombol untuk membuka penyaring."],
    workbenchNoChaptersSelected: [
        "Tidak ada bab yang dipilih",
        "Ditampilkan saat tidak ada yang dicentang.",
    ],
    workbenchWaitingForChapters: ["Mencari bab…", "Ditampilkan saat daftar bab sedang dimuat."],
    workbenchDetected: ["Terdeteksi", "Ditampilkan saat parser mengenali situs."],
    workbenchFieldTitle: ["Judul", "Judul cerita."],
    workbenchFieldAuthor: ["Penulis", "Penulis cerita."],
    workbenchFieldLanguage: ["Bahasa", "Bahasa cerita."],
    workbenchFieldFilename: ["Nama berkas", "Nama untuk menyimpan berkas EPUB."],
    workbenchResetFilename: ["Atur ulang", "Mengembalikan nama berkas ke bawaan."],
    workbenchChooseFromPage: ["Pilih dari halaman", "Mengambil gambar sampul dari halaman."],
    workbenchRemoveCover: ["Hapus sampul", "Menghapus gambar sampul."],
    workbenchIncludeAuthorNotes: [
        "Sertakan catatan penulis",
        "Mempertahankan catatan di akhir bab.",
    ],
    workbenchIncludeTocPage: ["Sertakan daftar isi", "Menambahkan daftar isi sebagai satu bab."],
    workbenchMoreOptions: ["Pilihan lainnya", "Membuka halaman pengaturan lengkap."],
    workbenchNoCover: ["Tanpa sampul", "Ditampilkan saat tidak ada gambar sampul."],
    workbenchCoverUrl: ["Alamat gambar sampul", "Alamat gambar sampul."],
    workbenchNoStoryHere: [
        "Tidak ada cerita di halaman ini",
        "Ditampilkan saat halaman ini bukan cerita.",
    ],
    workbenchTryAnyway: ["Coba saja", "Membuka meja kerja tetap saja."],
    workbenchUnsupportedSite: [
        "Situs ini belum didukung",
        "Ditampilkan saat tidak ada parser yang cocok.",
    ],
    workbenchUseSelectorBuilder: ["Buat selector", "Membuka pembuat selector."],
    workbenchReloadPage: ["Muat ulang halaman", "Memuat ulang tab."],

    // --- Chapter states ---
    chapterStateQueued: ["Antre", "Bab yang menunggu diambil."],
    chapterStateFetching: ["Mengambil", "Bab yang sedang diambil."],
    chapterStateLoaded: ["Dimuat", "Bab yang sudah dibaca."],
    chapterStateDownloaded: ["Terunduh", "Bab yang sudah ada di dalam buku."],
    chapterStateFailed: ["Gagal", "Bab yang tidak dapat dibaca."],
    chapterStateNotStarted: ["Belum dimulai", "Bab yang belum diambil."],

    // --- Progress phases ---
    phasePreparing: ["Menyiapkan", "Tahap pertama dari sebuah unduhan."],
    phaseFetchingChapters: ["Mengambil bab", "Tahap yang membaca bab-bab."],
    phaseDownloadingImages: ["Mengunduh gambar", "Tahap yang membaca gambar-gambar."],
    phaseBuildingEpub: ["Menyusun EPUB", "Tahap yang merakit buku."],
    phaseSaving: ["Menyimpan", "Tahap yang menulis berkas."],
    phaseComplete: ["Tersimpan", "Ditampilkan saat buku tersimpan."],
    phaseFailed: ["Gagal", "Ditampilkan saat unduhan gagal."],
    phaseCancelled: ["Dibatalkan", "Ditampilkan saat unduhan dihentikan."],

    // --- Popup ---
    popupOpenWorkbench: ["Buka meja kerja", "Tombol utama pada popup."],
    popupAddToLibrary: ["Tambahkan ke pustaka", "Tombol pustaka pada popup."],
    popupLibraryShort: ["Pustaka", "Label tombol pustaka pada popup."],
    popupWorkbenchShort: ["Meja kerja", "Label tombol meja kerja pada popup."],
    popupSettings: ["Pengaturan", "Tombol pengaturan pada popup."],
    popupNoStory: [
        "Tidak ada cerita terdeteksi di halaman ini.",
        "Ditampilkan saat halaman ini bukan cerita.",
    ],
    popupUnsupported: [
        "Situs ini belum didukung.",
        "Ditampilkan saat tidak ada parser yang cocok.",
    ],
    popupSaved: ["Buku Anda sudah siap.", "Ditampilkan saat unduhan selesai."],
    popupTryAgain: ["Coba lagi", "Tombol coba lagi pada popup."],
    popupUnsupportedHost: [
        "$HOST$ belum didukung.",
        "Ditampilkan saat tidak ada parser yang cocok dengan situs saat ini.",
    ],

    // --- Options ---
    optionsAppearance: ["Tampilan", "Kelompok pengaturan tampilan."],
    optionsStory: ["Cerita", "Kelompok pengaturan cerita."],
    optionsEpub: ["EPUB", "Kelompok pengaturan EPUB."],
    optionsImages: ["Gambar", "Kelompok pengaturan gambar."],
    optionsBehaviour: ["Perilaku", "Kelompok pengaturan perilaku."],
    optionsPrivacy: ["Privasi", "Kelompok pengaturan privasi."],
    optionsAdvanced: ["Lanjutan", "Kelompok pengaturan lanjutan."],
    optionsTheme: ["Tema", "Pengaturan tema."],
    optionsAccent: ["Warna aksen", "Pengaturan warna aksen."],
    optionsDensity: ["Kepadatan", "Pengaturan kepadatan."],
    optionsThemeSystem: ["Sistem", "Pilihan tema sistem."],
    optionsThemeLight: ["Terang", "Pilihan tema terang."],
    optionsThemeDark: ["Gelap", "Pilihan tema gelap."],
    optionsAccentGold: ["Emas", "Pilihan aksen emas."],
    optionsAccentInk: ["Tinta", "Pilihan aksen tinta."],
    optionsAccentVerdigris: ["Verdigris", "Pilihan aksen verdigris."],
    optionsAccentPlum: ["Prem", "Pilihan aksen prem."],
    optionsDensityComfortable: ["Longgar", "Pilihan kepadatan longgar."],
    optionsDensityCompact: ["Padat", "Pilihan kepadatan padat."],
    optionsSearchSettings: ["Cari pengaturan", "Kotak pencarian pengaturan."],
    optionsSiteAccess: ["Akses situs", "Daftar situs yang boleh dibaca ekstensi."],
    optionsRevoke: ["Cabut", "Menghapus akses ke sebuah situs."],
    optionsRevokeAll: ["Cabut semua", "Menghapus akses ke semua situs."],
    optionsExportSettings: ["Ekspor pengaturan", "Menyimpan pengaturan ke berkas."],
    optionsImportSettings: ["Impor pengaturan", "Memuat pengaturan dari berkas."],
    optionsResetAll: [
        "Atur ulang semua pengaturan",
        "Mengembalikan setiap pengaturan ke nilai bawaan.",
    ],
    optionsPrivacyNote: [
        "Kintsugi tidak mengirim apa pun ke siapa pun. Setiap permintaan jaringan hanya menuju situs yang sedang Anda baca.",
        "Catatan di bawah pengaturan privasi.",
    ],

    // --- Options: library ---
    optionsLibrary: ["Pustaka", "Tab pustaka dan buku-buku yang telah Anda buat."],
    optionsLibraryEmptyTitle: ["Pustaka Anda kosong.", "Judul pustaka yang kosong."],
    optionsLibraryEmptyText: [
        "Buku yang Anda buat disimpan di sini, sehingga Anda dapat memperbarui buku saat ada bab baru.",
        "Penjelasan untuk pustaka yang kosong.",
    ],
    optionsLibraryChapters: ["$COUNT$ bab", "Berapa banyak bab yang dimiliki sebuah buku."],
    optionsNoResults: [
        "Tidak ada yang cocok dengan pencarian itu.",
        "Ditampilkan saat pencarian pengaturan tidak menemukan hasil.",
    ],
    optionsNavLabel: ["Kelompok pengaturan", "Nama yang dapat diakses untuk navigasi pengaturan."],
    optionsLibraryMeta: ["$CHAPTERS$ bab · $SIZE$", "Baris metadata pada kartu pustaka."],

    // --- Options: individual settings ---
    settingReduceMotion: ["Selalu kurangi gerakan", "Pengaturan pengurangan gerakan."],
    settingReduceMotionHint: [
        "Mematikan transisi meskipun sistem tidak memintanya.",
        "Penjelasan pengaturan pengurangan gerakan.",
    ],
    settingFilenameTemplate: ["Templat nama berkas", "Pengaturan templat nama berkas."],
    settingFilenameTemplateHint: [
        "{title} dan {author} akan diganti saat berkas disimpan.",
        "Penjelasan pengaturan templat nama berkas.",
    ],
    settingDefaultLanguage: ["Bahasa bawaan", "Pengaturan bahasa bawaan."],
    settingDefaultLanguageHint: [
        "Kode ISO 639 yang digunakan bila sebuah situs tidak menyatakannya.",
        "Penjelasan pengaturan bahasa bawaan.",
    ],
    settingRemoveAuthorNotes: ["Hapus catatan penulis", "Pengaturan penghapusan catatan penulis."],
    settingRemoveAuthorNotesHint: [
        "Membuang catatan yang sering ditambahkan penulis di akhir bab.",
        "Penjelasan pengaturan penghapusan catatan penulis.",
    ],
    settingRemoveChapterNumbers: [
        "Hapus nomor bab dari judul",
        "Pengaturan penghapusan nomor bab.",
    ],
    settingIncludeTocPage: ["Sertakan daftar isi sebagai bab", "Pengaturan penyertaan daftar isi."],
    settingEpubVersion: ["Versi", "Pengaturan versi EPUB."],
    settingEpubVersionHint: [
        "Versi 3 adalah standar. Versi 2 untuk pembaca yang lebih lama.",
        "Penjelasan pengaturan versi EPUB.",
    ],
    settingAddInfoPage: ["Tambahkan halaman informasi", "Pengaturan halaman informasi."],
    settingAddInfoPageHint: [
        "Sebuah halaman berisi judul, penulis, dan sumber.",
        "Penjelasan pengaturan halaman informasi.",
    ],
    settingRemoveNextPrevLinks: [
        "Hapus tautan berikutnya dan sebelumnya",
        "Pengaturan penghapusan tautan navigasi bab.",
    ],
    settingIncludeSourceUrl: [
        "Sertakan URL sumber di setiap bab",
        "Pengaturan penyertaan URL sumber.",
    ],
    settingSkipImages: ["Lewati gambar sepenuhnya", "Pengaturan melewati gambar."],
    settingRemoveDuplicates: ["Hapus gambar duplikat", "Pengaturan penghapusan duplikat gambar."],
    settingPreferHighestResolution: [
        "Utamakan resolusi tertinggi",
        "Pengaturan pemilihan resolusi tertinggi.",
    ],
    settingUseSvg: ["Izinkan gambar SVG", "Pengaturan izin gambar SVG."],
    settingCompressImages: ["Kompres gambar", "Pengaturan kompresi gambar."],
    settingMaxResolution: ["Resolusi maksimum", "Pengaturan resolusi maksimum."],
    settingMaxResolutionHint: [
        "Dalam piksel pada sisi terpanjang.",
        "Penjelasan pengaturan resolusi maksimum.",
    ],
    settingSkipFailedChapters: ["Lewati bab yang gagal", "Pengaturan melewati bab yang gagal."],
    settingSkipFailedChaptersHint: [
        "Bab yang gagal menjadi catatan di dalam buku, bukan menghentikan proses.",
        "Penjelasan pengaturan melewati bab yang gagal.",
    ],
    settingRetryOnEmptyPage: [
        "Coba lagi pada halaman kosong",
        "Pengaturan percobaan ulang pada halaman kosong.",
    ],
    settingMinimumDelay: ["Jeda minimum antarpermintaan", "Pengaturan jeda minimum."],
    settingMinimumDelayHint: [
        "Dalam milidetik. Naikkan untuk situs yang membatasi permintaan secara ketat.",
        "Penjelasan pengaturan jeda minimum.",
    ],
    settingMaxChapters: ["Jumlah bab maksimum per buku", "Pengaturan jumlah bab maksimum."],
    settingDelayPerChapter: ["Jeda tambahan per bab", "Pengaturan jeda per bab."],
    settingDelayPerChapterHint: [
        "Dalam milidetik, di atas jeda minimum.",
        "Penjelasan pengaturan jeda per bab.",
    ],
    settingMetadataLookup: ["Cari metadata buku", "Pengaturan pencarian metadata."],
    settingMetadataLookupHint: [
        "Mati secara bawaan. Jika diaktifkan, judul diperiksa terhadap basis data publik.",
        "Penjelasan pengaturan pencarian metadata.",
    ],
    settingSendStoryUrl: [
        "Kirim URL cerita bersama pencarian",
        "Pengaturan pengiriman URL cerita.",
    ],
    settingSendStoryUrlHint: [
        "Mati secara bawaan. Tanpanya, pencarian hanya dapat memakai judul.",
        "Penjelasan pengaturan pengiriman URL cerita.",
    ],
    settingDiagnostics: ["Diagnostik pengembang", "Pengaturan diagnostik."],
    settingDiagnosticsHint: [
        "Mencatat lebih banyak detail ke konsol. Mati secara bawaan.",
        "Penjelasan pengaturan diagnostik.",
    ],

    // --- Onboarding ---
    onboardingWelcome: ["Selamat datang di Kintsugi", "Judul langkah pertama orientasi."],
    onboardingStep1: ["Langkah 1 dari 3", "Label langkah pertama orientasi."],
    onboardingStep2: ["Langkah 2 dari 3", "Label langkah kedua orientasi."],
    onboardingStep3: ["Langkah 3 dari 3", "Label langkah ketiga orientasi."],
    onboardingNext: ["Berikutnya", "Tombol untuk ke langkah berikutnya."],
    onboardingBack: ["Kembali", "Tombol untuk ke langkah sebelumnya."],
    onboardingFinish: ["Selesai", "Tombol untuk menyelesaikan orientasi."],
    onboardingSkip: ["Lewati", "Tombol untuk melewati orientasi."],
    onboardingGetStarted: ["Mulai", "Tombol untuk keluar dari orientasi."],
    onboardingWelcomeText: [
        "Ubah novel web mana pun menjadi buku yang layak disimpan. Arahkan ke daftar bab, dan Kintsugi akan menyusun EPUB yang rapi — lengkap dengan sampul dan daftar isi.",
        "Penjelasan langkah pertama orientasi.",
    ],
    onboardingWelcomeFootnote: [
        "Tanpa akun. Tanpa pelacakan. Bisa dipakai luring.",
        "Catatan kaki langkah pertama orientasi.",
    ],
    onboardingWhichSite: ["Situs mana yang sedang Anda baca?", "Judul langkah kedua orientasi."],
    onboardingWhichSiteText: [
        "Kintsugi mengenal ratusan situs. Buka salah satu, dan Kintsugi menawarkan untuk menyusun bukunya.",
        "Penjelasan langkah kedua orientasi.",
    ],
    onboardingWhichSiteFootnote: [
        "Tidak ada dalam daftar? Kintsugi tetap bisa membacanya — Anda bisa membuat selector sendiri.",
        "Catatan kaki langkah kedua orientasi.",
    ],
    onboardingMakeItYours: ["Jadikan milik Anda", "Judul langkah ketiga orientasi."],
    onboardingMakeItYoursText: [
        "Ini pratinjau langsung. Pilih apa yang Anda sukai.",
        "Penjelasan langkah ketiga orientasi.",
    ],

    // --- Errors ---
    errorGeneric: ["Terjadi kesalahan. Silakan coba lagi.", "Pesan kesalahan bawaan."],
    errorNetwork: ["Tidak dapat menghubungi situs.", "Kegagalan jaringan."],
    errorNoParser: [
        "Kintsugi belum mengenal situs ini.",
        "Tidak ada parser yang cocok dengan URL ini.",
    ],
    errorTimeout: ["Situs terlalu lama menjawab.", "Waktu habis."],
    errorCancelled: ["Dibatalkan.", "Pengguna membatalkan operasi."],
    errorForbidden: ["Situs menolak permintaan tersebut.", "HTTP 403."],
    errorParse: ["Halaman tidak dapat dibaca.", "Halaman tidak dapat diurai."],
    errorNoChapters: ["Tidak ditemukan bab di halaman ini.", "Daftar bab kosong."],

    // --- Filter ---
    filterSearch: ["Cari", "Kotak pencarian penyaring."],
    filterUseRegex: ["Gunakan ekspresi reguler", "Apakah pencarian memakai regex."],
    filterInclude: ["Sertakan", "Hanya bab yang cocok yang dipertahankan."],
    filterExclude: ["Kecualikan", "Bab yang cocok dihapus."],
    filterMatchCount: ["$COUNT$ cocok", "Berapa banyak bab yang cocok dengan penyaring."],
    filterClear: ["Bersihkan", "Mengosongkan penyaring."],
    filterApply: ["Terapkan", "Menerapkan penyaring."],
    filterInvalidPattern: ["Pola itu tidak valid.", "Ditampilkan saat regex gagal dikompilasi."],

    // --- Site selectors ---
    siteSelectorBannerTitle: [
        "Tidak ada parser untuk situs ini",
        "Judul banner yang tampil saat parser cadangan digunakan.",
    ],
    siteSelectorBannerText: [
        "Kintsugi sedang menebak letak ceritanya. Beri tahu sekali saja, dan Kintsugi akan mengingatnya.",
        "Penjelasan banner.",
    ],
    siteSelectorOpen: ["Atur situs ini", "Tombol yang membuka dialog selector situs."],
    siteSelectorDialogTitle: ["Selector situs", "Judul dialog selector situs."],
    siteSelectorIntro: [
        "Selector CSS ini memberi tahu Kintsugi di mana teks sebuah bab berada. Selector hanya diingat untuk situs ini.",
        "Pengantar dialog.",
    ],
    siteSelectorContent: ["Teks bab", "Label kolom selector konten."],
    siteSelectorContentHint: [
        "Elemen yang memuat teks bab, sebagai selector CSS.",
        "Petunjuk selector konten.",
    ],
    siteSelectorTitle: ["Judul bab", "Label kolom selector judul."],
    siteSelectorTitleHint: ["Elemen yang memuat judul bab. Opsional.", "Petunjuk selector judul."],
    siteSelectorRemove: ["Elemen yang dibuang", "Label kolom selector buang."],
    siteSelectorRemoveHint: [
        "Komentar, iklan, dan navigasi untuk dibuang. Opsional.",
        "Petunjuk selector buang.",
    ],
    siteSelectorSuggest: ["Usulkan", "Tombol yang meminta saran dari pemindai."],
    siteSelectorSuggested: [
        "Tebakan dari halaman. Uji dulu sebelum menyimpan.",
        "Ditampilkan setelah pemindai mengusulkan selector.",
    ],
    siteSelectorTest: ["Uji", "Tombol yang menguji selector terhadap halaman."],
    siteSelectorTestResult: [
        "Cocok dengan $CHARS$ karakter.",
        "Berapa banyak teks yang cocok dengan selector konten.",
    ],
    siteSelectorTestFailed: [
        "Selector itu tidak cocok dengan apa pun di halaman ini.",
        "Ditampilkan saat pengujian tidak menemukan apa pun.",
    ],
    siteSelectorInvalid: [
        "Itu bukan selector CSS yang valid.",
        "Ditampilkan saat selector gagal diurai.",
    ],
    siteSelectorSave: ["Simpan", "Menyimpan selector."],
    siteSelectorSaved: [
        "Tersimpan. Kintsugi akan memakai ini untuk situs ini mulai sekarang.",
        "Konfirmasi setelah menyimpan.",
    ],
    siteSelectorForget: ["Lupakan situs ini", "Menghapus selector yang tersimpan."],
    siteSelectorForgotten: [
        "Dilupakan. Kintsugi akan menebak lagi.",
        "Konfirmasi setelah melupakan.",
    ],
    siteSelectorList: ["Selector situs", "Bagian selector situs pada halaman opsi."],
    siteSelectorListEmpty: [
        "Belum ada situs yang diatur.",
        "Keadaan kosong pada daftar selector situs.",
    ],
    siteSelectorTocDetected: [
        "Halaman itu terlihat seperti daftar isi, bukan bab. Buka sebuah bab lalu coba lagi.",
        "Ditampilkan saat pemindai mengenali daftar isi.",
    ],
};
