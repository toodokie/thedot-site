import AppKit

// Editable, deterministic print compositions for The Dot's five-part IG series.
// Run: swift content/blog-drafts/one-brand-three-tools/instagram/render.swift
// The licensed web fonts are not embedded in exports; headings use macOS Futura.

let root = "content/blog-drafts/one-brand-three-tools"
let out = "\(root)/instagram/rendered"
try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func c(_ hex: String) -> NSColor {
    let h = hex.replacingOccurrences(of: "#", with: "")
    let n = Int(h, radix: 16) ?? 0
    return NSColor(calibratedRed: CGFloat((n >> 16) & 255)/255, green: CGFloat((n >> 8) & 255)/255, blue: CGFloat(n & 255)/255, alpha: 1)
}
let cream = c("FAF9F6"), ink = c("35332F"), yellow = c("DAFF00"), grey = c("8A8882"), paper = c("FFFFFF")
var canvasHeight: CGFloat = 1350

func font(_ size: CGFloat, bold: Bool = false) -> NSFont {
    NSFont(name: bold ? "Futura-Bold" : "Futura-Medium", size: size) ?? NSFont.systemFont(ofSize: size, weight: bold ? .bold : .medium)
}
func box(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ fill: NSColor, stroke: NSColor? = nil, line: CGFloat = 1) {
    let r = NSRect(x: x, y: canvasHeight-y-h, width: w, height: h)
    fill.setFill(); NSBezierPath(rect: r).fill()
    if let s = stroke { s.setStroke(); let p = NSBezierPath(rect: r); p.lineWidth = line; p.stroke() }
}
func circle(_ x: CGFloat, _ y: CGFloat, _ d: CGFloat, _ fill: NSColor, stroke: NSColor? = nil, line: CGFloat = 1) {
    let r = NSRect(x: x, y: canvasHeight-y-d, width: d, height: d)
    fill.setFill(); NSBezierPath(ovalIn: r).fill()
    if let s = stroke { s.setStroke(); let p = NSBezierPath(ovalIn: r); p.lineWidth = line; p.stroke() }
}
func line(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat, _ col: NSColor, _ width: CGFloat = 2) {
    col.setStroke(); let p=NSBezierPath(); p.lineWidth=width
    p.move(to:NSPoint(x:x1,y:canvasHeight-y1)); p.line(to:NSPoint(x:x2,y:canvasHeight-y2)); p.stroke()
}
func txt(_ s: String, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ size: CGFloat, _ color: NSColor, bold: Bool = false, spacing: CGFloat = 0, height: CGFloat = 1000) {
    let p=NSMutableParagraphStyle(); p.lineSpacing=spacing; p.lineBreakMode = .byWordWrapping
    let a=NSAttributedString(string:s, attributes:[.font:font(size,bold:bold),.foregroundColor:color,.paragraphStyle:p])
    a.draw(in:NSRect(x:x,y:canvasHeight-y-height,width:w,height:height))
}
func dotMark(_ x: CGFloat, _ y: CGFloat, _ dark: Bool) {
    let col = dark ? cream : ink
    circle(x,y,28,col)
    circle(x+9,y+6,13,dark ? ink : cream)
    line(x+15,y,x+15,y+14,col,3)
}
func mast(_ ep: Int, _ page: Int, dark: Bool = false) {
    let fg=dark ? cream : ink
    line(78,65,1002,65,fg,3)
    dotMark(78,83,dark)
    txt("THE DOT / FIELD NOTES",120,78,600,23,fg,bold:true,height:35)
    txt(String(format:"%02d / %02d",ep,page),832,78,180,23,fg,bold:true,height:35)
    line(78,1220,1002,1220,fg,2)
    txt("ONE BRAND / THREE TOOLS",78,1240,650,22,fg,bold:true,height:45)
    txt("@THEDOTCREATIVEAGENCY",710,1240,295,18,fg,height:45)
}
func tag(_ s:String,_ x:CGFloat,_ y:CGFloat,_ width:CGFloat) { box(x,y,width,43,yellow); txt(s,x+12,y+7,width-24,23,ink,bold:true,height:32) }
func orbs(_ x:CGFloat,_ y:CGFloat,_ scale:CGFloat) {
    for row in 0..<4 { for col in 0..<4 {
        let d:CGFloat=35*scale, px=x+CGFloat(col)*72*scale, py=y+CGFloat(row)*72*scale
        let isDark=(row+col)%4==0
        circle(px,py,d,isDark ? ink : c("B8B7B2"))
        if !isDark { circle(px+7*scale,py+6*scale,d * 0.54,c("E9E8E5")) }
    }}
}
func arrows(_ x:CGFloat,_ y:CGFloat,_ col:NSColor) {
    line(x,y,x+175,y,col,4);line(x+175,y,x+152,y-17,col,4);line(x+175,y,x+152,y+17,col,4)
}

let coverTitles = [
    "ONE BRAND.\nTHREE TOOLS.\nONE SOURCE\nOF TRUTH.",
    "YOUR BRAND\nVOICE NEEDS\nMORE THAN\nA PROMPT.",
    "SHOW THE\nSYSTEM.\nTHEN EXPLORE.",
    "THIS IS WHERE\nTHE DRAFT\nBECOMES\nAN ASSET.",
    "YOUR BRAND\nSYSTEM IS\nA LIVING\nFILE."
]
let episodeNames=["THE MAP","CHATGPT","CLAUDE DESIGN","CANVA","KEEP IT CURRENT"]

func drawCover(_ ep:Int) {
    let dark = ep == 2 || ep == 5
    box(0,0,1080,1350,dark ? ink : cream)
    mast(ep,1,dark:dark)
    let fg=dark ? cream : ink
    tag("SERIES  /  \(String(format:"%02d",ep))",78,164,230)
    txt(episodeNames[ep-1],78,231,880,31,fg,bold:true,height:60)
    if ep == 1 {
        txt(coverTitles[0],78,328,850,87,ink,bold:true,spacing:-2,height:520)
        box(78,923,450,144,ink);box(285,989,430,144,cream,stroke:ink,line:3);box(545,915,455,144,yellow)
        txt("CHATGPT",99,961,360,25,cream,bold:true,height:40)
        txt("CLAUDE",304,1030,330,25,ink,bold:true,height:40)
        txt("CANVA",570,953,350,25,ink,bold:true,height:40)
        circle(938,986,43,ink)
    } else if ep == 2 {
        box(735,350,278,610,cream);box(710,373,278,610,c("DAD8D1"));box(686,395,278,610,paper)
        txt("VOICE / 01",710,430,230,23,ink,bold:true,height:45)
        line(710,485,920,485,ink,2)
        for i in 0..<5 { box(710,523+CGFloat(i)*70,CGFloat(194-i*13),10,i==2 ? yellow : c("CCCAC3")) }
        txt(coverTitles[1],78,314,593,70,cream,bold:true,spacing:-3,height:650)
        circle(770,790,110,yellow)
    } else if ep == 3 {
        txt(coverTitles[2],78,305,900,87,ink,bold:true,spacing:-2,height:380)
        box(78,717,425,420,paper,stroke:ink,line:3);box(526,717,476,420,ink)
        txt("A / TYPE",106,749,300,26,ink,bold:true,height:45)
        txt("B / PRODUCT",553,749,340,26,cream,bold:true,height:45)
        box(108,835,300,20,ink);box(108,878,235,20,ink);circle(156,949,100,c("C9C8C3"))
        circle(649,870,175,c("BDBBB5"));circle(695,904,86,cream)
        box(553,1075,395,14,yellow)
    } else if ep == 4 {
        txt(coverTitles[3],78,295,915,79,ink,bold:true,spacing:-2,height:460)
        box(137,770,805,347,paper,stroke:ink,line:4)
        box(177,810,270,267,c("DAD8D1"));circle(237,867,147,ink);circle(269,900,82,c("DAD8D1"))
        txt("FINAL / 01",477,812,420,29,ink,bold:true,height:50)
        box(477,888,382,18,ink);box(477,933,310,18,ink);box(477,1020,204,28,yellow)
        for p in [(129.0,762.0),(934.0,762.0),(129.0,1109.0),(934.0,1109.0)] { box(CGFloat(p.0),CGFloat(p.1),16,16,ink) }
    } else {
        txt(coverTitles[4],78,310,875,88,cream,bold:true,spacing:-3,height:540)
        for i in 0..<3 {let y:CGFloat=842+CGFloat(i)*95;box(78,y,924,70,i==2 ? yellow : c("54514A"));txt(i==0 ? "V 01   OLD LOGO" : i==1 ? "V 02   NEW OFFER" : "V 03   APPROVED",102,y+18,800,28,i==2 ? ink : cream,bold:true,height:40)}
    }
}

let slideHeaders:[[String]]=[
    ["START WITH A\nBRAND PACK.","GIVE EACH\nTOOL A JOB.","THE THREE\nSECOND CHECK."],
    ["BUILD A\nPROJECT.","ASK FOR\nCONTRAST.","CHOOSE THE ANGLE.\nEDIT THE WORDS."],
    ["GIVE IT VISUAL\nEVIDENCE.","COMPARE\nDIRECTIONS.","A PREVIEW IS\nA PROPOSAL."],
    ["SET UP THE\nBRAND KIT.","FINISH AT\nREAL SIZE.","SAVE THE\nAPPROVED LAYOUT."],
    ["UPDATE THE\nSOURCE FIRST.","THEN UPDATE\nALL THREE.","AGILITY IS\nCONTROLLED CHANGE."]
]
let slideLines:[[[String]]]=[
    [["Correct logos","Exact colours","Licensed type","Audience and offer","Approved examples"],["CHATGPT   /   angles + copy","CLAUDE       /   visual direction","CANVA          /   editable finish"],["RIGHT LOGO?","CLEAR MESSAGE?","REAL PRODUCT?","Full guide in the article. Link in bio."]],
    [["Add the dated brand pack.","Set audience, offer and tone.","Name the claims a person must check."],["Three distinct campaign angles.","One promise and headline each.","Flag anything you would invent."],["A Project holds context.","Your business makes the choice.","Full guide in the article. Link in bio."]],
    [["Logos. Brand guide. Strong examples.","Check extracted colours and fonts.","Fix the system before team use."],["One approved headline.","A typographic poster.","A product-led composition."],["Check crop, hierarchy and truth.","Then take the best idea to Canva.","Full guide in the article. Link in bio."]],
    [["Logo variants, colours and fonts.","Guidelines and approved templates.","Test the kit on a real page."],["Use the real product photo.","Check crop, licence and facts.","Export the format you need."],["Reuse what passed review.","Change one thing per variation.","Full guide in the article. Link in bio."]],
    [["Name an owner. Date the pack.","Record changed offers and assets.","Remove obsolete examples."],["Canva Brand Kit.","ChatGPT Project.","Claude Design system."],["Run one identical test brief.","Keep recognition. Adapt the message.","Full checklist in the article. Link in bio."]]
]

func drawContent(_ ep:Int,_ page:Int) {
    let dark = (ep == 2 && page == 3) || (ep == 5 && page == 4)
    let fg = dark ? cream : ink
    box(0,0,1080,1350,dark ? ink : cream);mast(ep,page,dark:dark)
    txt("\(episodeNames[ep-1])  /  \(page-1) OF 3",78,174,850,27,fg,bold:true,height:45)
    let headerSize:CGFloat = (ep == 5 && page == 4) ? 64 : 78
    txt(slideHeaders[ep-1][page-2],78,245,925,headerSize,fg,bold:true,spacing:-2,height:275)
    line(78,560,1002,560,fg,3)
    let lines=slideLines[ep-1][page-2]
    if page == 2 {
        for (i,s) in lines.enumerated() {
            let y:CGFloat=618+CGFloat(i)*104
            circle(80,y+3,43,i==2 ? yellow : fg)
            txt(s,151,y-4,835,38,fg,bold:i==2,height:80)
            line(151,y+79,1002,y+79,fg.withAlphaComponent(0.25),1)
        }
    } else if page == 3 {
        for (i,s) in lines.enumerated() {
            let y:CGFloat=625+CGFloat(i)*158
            box(78,y,924,132,i==2 ? yellow : (dark ? c("56534E") : paper),stroke:dark ? cream : ink,line:2)
            txt(s,105,y+42,870,37,i==2 ? ink : fg,bold:true,height:64)
        }
    } else {
        box(78,618,924,488,dark ? c("57544D") : ink)
        for (i,s) in lines.enumerated() {
            let y:CGFloat=675+CGFloat(i)*133
            txt(String(format:"%02d",i+1),110,y,87,26,yellow,bold:true,height:45)
            txt(s,215,y-10,740,34,cream,bold:i==0,height:95)
            if i<2 { line(110,y+102,964,y+102,cream.withAlphaComponent(0.32),2) }
        }
    }
    if ep == 1 && page == 3 { orbs(715,1004,0.65) }
}

func render(_ w:Int,_ h:Int,_ draw:()->Void,_ path:String) {
    canvasHeight=CGFloat(h)
    let image=NSImage(size:NSSize(width:w,height:h))
    image.lockFocus(); NSGraphicsContext.current?.imageInterpolation = .high
    draw(); image.unlockFocus()
    guard let tiff=image.tiffRepresentation, let rep=NSBitmapImageRep(data:tiff),let data=rep.representation(using:.png,properties:[:]) else { fatalError("PNG render failed") }
    try! data.write(to:URL(fileURLWithPath:path))
}
for ep in 1...5 {
    for page in 1...4 {
        let name=String(format:"episode-%02d-slide-%02d.png",ep,page)
        render(1080,1350,{ page == 1 ? drawCover(ep) : drawContent(ep,page) },"\(out)/\(name)")
    }
}

// Website feature image: a landscape print table with one source card feeding three tools.
render(1200,630,{
    box(0,0,1200,630,cream)
    line(55,49,1145,49,ink,2)
    txt("THE DOT / FIELD NOTES",55,62,600,24,ink,bold:true,height:40)
    txt("01 / DESIGN SYSTEMS",860,62,300,23,ink,bold:true,height:40)
    txt("ONE BRAND.\nTHREE TOOLS.",55,155,700,83,ink,bold:true,spacing:-2,height:230)
    txt("Set up the system. Make the campaign.",59,420,700,30,ink,height:60)
    box(805,163,304,270,ink);box(780,187,304,270,paper,stroke:ink,line:2);box(754,211,304,270,yellow,stroke:ink,line:2)
    txt("SOURCE\nOF TRUTH",787,258,250,43,ink,bold:true,height:170)
    for i in 0..<3 { circle(796+CGFloat(i)*68,395,42,ink) }
    line(55,556,1145,556,ink,2)
    txt("CANVA  /  CHATGPT  /  CLAUDE DESIGN",55,570,900,22,ink,bold:true,height:40)
},"public/images/blog/one-brand-three-tools-design-system/cover.png")

print("Rendered 20 slides and one website cover")
