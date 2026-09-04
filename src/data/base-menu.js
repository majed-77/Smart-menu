"use strict";

/**
 * المنيو الأساسي لمطاعم سفرة الديرة.
 * الأسعار بالريال السعودي، والسعرات تقديرية للحصة الموضحة.
 */

const BASE_CATEGORIES = [
  { key: "rice", nameAr: "أطباق الرز", nameEn: "Rice Platters", nameFr: "Plats de riz", sortOrder: 0, visible: true },
  { key: "mandi", nameAr: "المندي والمظبي", nameEn: "Mandi & Madhbi", nameFr: "Mandi et Madhbi", sortOrder: 1, visible: true },
  { key: "heritage", nameAr: "أطباق شعبية", nameEn: "Saudi Classics", nameFr: "Spécialités saoudiennes", sortOrder: 2, visible: true },
  { key: "grills", nameAr: "المشويات", nameEn: "Grills", nameFr: "Grillades", sortOrder: 3, visible: true },
  { key: "sides", nameAr: "المقبلات والإضافات", nameEn: "Sides & Starters", nameFr: "Entrées et accompagnements", sortOrder: 4, visible: true },
  { key: "desserts", nameAr: "الحلويات", nameEn: "Desserts", nameFr: "Desserts", sortOrder: 5, visible: true },
  { key: "drinks", nameAr: "المشروبات", nameEn: "Drinks", nameFr: "Boissons", sortOrder: 6, visible: true }
];

function menuItem({ key, category, names, descriptions, price, image, calories, signature = false, sortOrder = 0, categorySortOrder = 0, modifiers = [] }) {
  return {
    itemKey: `base:safrat-${key}`,
    category,
    nameAr: names.ar,
    nameEn: names.en,
    nameFr: names.fr,
    descriptionAr: descriptions.ar,
    descriptionEn: descriptions.en,
    descriptionFr: descriptions.fr,
    priceText: String(price),
    imageUrl: `/assets/images/menu/${image}`,
    signature,
    active: true,
    visible: true,
    custom: false,
    sortOrder,
    categorySortOrder,
    calories,
    modifiers
  };
}

const BASE_MENU_ITEMS = [
  menuItem({
    key: "kabsa-lamb", category: "أطباق الرز", categorySortOrder: 0, sortOrder: 0, signature: true,
    names: { ar: "كبسة لحم", en: "Lamb Kabsa", fr: "Kabsa à l’agneau" },
    descriptions: { ar: "أرز بسمتي مبهر مع لحم طري، يُقدم مع الدقوس والسلطة.", en: "Spiced basmati rice with tender lamb, served with tomato salsa and salad.", fr: "Riz basmati épicé et agneau tendre, servis avec sauce tomate et salade." },
    price: "72", calories: 1150, image: "kabsa-lamb.webp",
    modifiers: [{ name: "زيادة رز", priceText: "8", type: "addon" }, { name: "دقوس إضافي", priceText: "3", type: "addon" }]
  }),
  menuItem({
    key: "kabsa-chicken", category: "أطباق الرز", categorySortOrder: 0, sortOrder: 1,
    names: { ar: "كبسة دجاج", en: "Chicken Kabsa", fr: "Kabsa au poulet" },
    descriptions: { ar: "نصف دجاجة محمرة فوق أرز الكبسة المتبل مع الدقوس.", en: "Roasted half chicken over aromatic kabsa rice with tomato salsa.", fr: "Demi-poulet rôti sur riz kabsa parfumé, accompagné de sauce tomate." },
    price: "34", calories: 950, image: "kabsa-chicken.webp",
    modifiers: [{ name: "بدون جلد", priceText: "0", type: "option" }, { name: "زيادة رز", priceText: "8", type: "addon" }]
  }),
  menuItem({
    key: "madghout-lamb", category: "أطباق الرز", categorySortOrder: 0, sortOrder: 2,
    names: { ar: "مضغوط لحم", en: "Lamb Madghout", fr: "Madghout à l’agneau" },
    descriptions: { ar: "لحم مطهو بالضغط مع أرز أحمر غني بالبهارات والخضار.", en: "Pressure-cooked lamb with rich red rice, spices and vegetables.", fr: "Agneau cuit sous pression avec riz rouge, épices et légumes." },
    price: "82", calories: 1200, image: "madghout-lamb.webp"
  }),
  menuItem({
    key: "mandi-lamb", category: "المندي والمظبي", categorySortOrder: 1, sortOrder: 0, signature: true,
    names: { ar: "مندي لحم", en: "Lamb Mandi", fr: "Mandi à l’agneau" },
    descriptions: { ar: "لحم طري مطهو ببطء مع أرز مندي مدخن.", en: "Slow-cooked tender lamb with lightly smoked mandi rice.", fr: "Agneau tendre mijoté avec riz mandi légèrement fumé." },
    price: "78", calories: 1100, image: "mandi-lamb.webp"
  }),
  menuItem({
    key: "mandi-chicken", category: "المندي والمظبي", categorySortOrder: 1, sortOrder: 1,
    names: { ar: "مندي دجاج", en: "Chicken Mandi", fr: "Mandi au poulet" },
    descriptions: { ar: "نصف دجاجة مندي مع أرز مدخن وصوص الدقوس.", en: "Mandi half chicken with smoked rice and tomato salsa.", fr: "Demi-poulet mandi, riz fumé et sauce tomate." },
    price: "36", calories: 900, image: "mandi-chicken.webp"
  }),
  menuItem({
    key: "madhbi-chicken", category: "المندي والمظبي", categorySortOrder: 1, sortOrder: 2,
    names: { ar: "مظبي دجاج", en: "Chicken Madhbi", fr: "Poulet Madhbi" },
    descriptions: { ar: "دجاج مشوي على الحجر، يقدم فوق أرز بسمتي عطري.", en: "Stone-grilled chicken served over fragrant basmati rice.", fr: "Poulet grillé sur pierre, servi sur riz basmati parfumé." },
    price: "38", calories: 850, image: "madhbi-chicken.webp"
  }),
  menuItem({
    key: "mathloutha", category: "أطباق شعبية", categorySortOrder: 2, sortOrder: 0, signature: true,
    names: { ar: "مثلوثة لحم", en: "Lamb Mathloutha", fr: "Mathloutha à l’agneau" },
    descriptions: { ar: "طبقات من القرصان والجريش والأرز تعلوها قطع اللحم والبصل المحمر.", en: "Layers of qursan, jareesh and rice topped with lamb and caramelized onions.", fr: "Couches de qursan, jareesh et riz, garnies d’agneau et d’oignons dorés." },
    price: "48", calories: 1050, image: "mathloutha.webp"
  }),
  menuItem({
    key: "jareesh", category: "أطباق شعبية", categorySortOrder: 2, sortOrder: 1,
    names: { ar: "جريش نجدي", en: "Najdi Jareesh", fr: "Jareesh du Najd" },
    descriptions: { ar: "قمح مجروش مطهو باللبن، يزين بالبصل المحمر.", en: "Cracked wheat slowly cooked with laban and topped with fried onions.", fr: "Blé concassé mijoté au laban et garni d’oignons dorés." },
    price: "18", calories: 390, image: "jareesh.webp"
  }),
  menuItem({
    key: "qursan", category: "أطباق شعبية", categorySortOrder: 2, sortOrder: 2,
    names: { ar: "قرصان", en: "Qursan", fr: "Qursan" },
    descriptions: { ar: "رقائق قمح مع مرق الخضار واللحم بنكهة نجدية أصيلة.", en: "Whole-wheat sheets with vegetable and meat stew in traditional Najdi style.", fr: "Feuilles de blé complet, ragoût de légumes et viande à la manière du Najd." },
    price: "20", calories: 420, image: "qursan.webp"
  }),
  menuItem({
    key: "mixed-grill", category: "المشويات", categorySortOrder: 3, sortOrder: 0,
    names: { ar: "مشاوي مشكلة", en: "Mixed Grill", fr: "Grillades mixtes" },
    descriptions: { ar: "كباب لحم وشيش طاووق وريش، مع بطاطس وخضار مشوية.", en: "Beef kebab, shish tawook and lamb chops with fries and grilled vegetables.", fr: "Kebab de bœuf, chich taouk et côtelettes avec frites et légumes grillés." },
    price: "54", calories: 780, image: "mixed-grill.webp"
  }),
  menuItem({
    key: "arabic-salad", category: "المقبلات والإضافات", categorySortOrder: 4, sortOrder: 0,
    names: { ar: "سلطة عربية", en: "Arabic Salad", fr: "Salade arabe" },
    descriptions: { ar: "خيار وطماطم وخس وبقدونس مع الليمون وزيت الزيتون.", en: "Cucumber, tomato, lettuce and parsley with lemon and olive oil.", fr: "Concombre, tomate, laitue et persil au citron et à l’huile d’olive." },
    price: "12", calories: 120, image: "arabic-salad.webp"
  }),
  menuItem({
    key: "hot-sauce", category: "المقبلات والإضافات", categorySortOrder: 4, sortOrder: 1,
    names: { ar: "دقوس حار", en: "Spicy Tomato Salsa", fr: "Sauce tomate piquante" },
    descriptions: { ar: "طماطم وفلفل حار مطحونان طازجًا.", en: "Freshly blended tomato and chili salsa.", fr: "Sauce fraîche de tomate et piment." },
    price: "3", calories: 35, image: "hot-sauce.webp"
  }),
  menuItem({
    key: "sambousek", category: "المقبلات والإضافات", categorySortOrder: 4, sortOrder: 2,
    names: { ar: "سمبوسة مشكلة", en: "Mixed Sambousek", fr: "Sambousek assortis" },
    descriptions: { ar: "ست قطع مقرمشة بحشوات اللحم والجبن والخضار.", en: "Six crispy pastries filled with meat, cheese and vegetables.", fr: "Six feuilletés croustillants farcis à la viande, au fromage et aux légumes." },
    price: "14", calories: 420, image: "sambousek.webp"
  }),
  menuItem({
    key: "kunafa", category: "الحلويات", categorySortOrder: 5, sortOrder: 0, signature: true,
    names: { ar: "كنافة بالقشطة", en: "Cream Kunafa", fr: "Kounafa à la crème" },
    descriptions: { ar: "كنافة ساخنة بالقشطة والفستق مع قطر خفيف.", en: "Warm kunafa with cream, pistachio and light syrup.", fr: "Kounafa chaude à la crème et pistache, sirop léger." },
    price: "16", calories: 510, image: "kunafa.webp"
  }),
  menuItem({
    key: "saffron-rice-pudding", category: "الحلويات", categorySortOrder: 5, sortOrder: 1,
    names: { ar: "أرز بالحليب والزعفران", en: "Saffron Rice Pudding", fr: "Riz au lait au safran" },
    descriptions: { ar: "حلى أرز كريمي بالحليب والزعفران والفستق.", en: "Creamy rice pudding with milk, saffron and pistachio.", fr: "Riz au lait crémeux au safran et à la pistache." },
    price: "14", calories: 360, image: "saffron-rice-pudding.webp"
  }),
  menuItem({
    key: "laban", category: "المشروبات", categorySortOrder: 6, sortOrder: 0,
    names: { ar: "لبن بارد", en: "Chilled Laban", fr: "Laban frais" },
    descriptions: { ar: "لبن طازج مبرد.", en: "Fresh chilled laban.", fr: "Laban frais et bien froid." },
    price: "5", calories: 110, image: "laban.webp"
  }),
  menuItem({
    key: "mint-tea", category: "المشروبات", categorySortOrder: 6, sortOrder: 1,
    names: { ar: "شاي بالنعناع", en: "Mint Tea", fr: "Thé à la menthe" },
    descriptions: { ar: "شاي أحمر بالنعناع الطازج.", en: "Black tea with fresh mint.", fr: "Thé noir à la menthe fraîche." },
    price: "4", calories: 15, image: "mint-tea.webp"
  }),
  menuItem({
    key: "soft-drink", category: "المشروبات", categorySortOrder: 6, sortOrder: 2,
    names: { ar: "مشروب غازي", en: "Soft Drink", fr: "Boisson gazeuse" },
    descriptions: { ar: "مشروب غازي بارد حسب الاختيار.", en: "Chilled soft drink of your choice.", fr: "Boisson gazeuse fraîche au choix." },
    price: "5", calories: 140, image: "soft-drink.webp"
  })
];

module.exports = { BASE_CATEGORIES, BASE_MENU_ITEMS };
