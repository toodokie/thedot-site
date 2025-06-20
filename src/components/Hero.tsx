import React from "react";

export default function Hero() {
  const posterUrl =
    "https://uploads-ssl.webflow.com/60523cba14ff1807fd1464d1/65064d348f51eebec1633558_hero%20demo%202-poster-00001.jpg";
  const videoMp4 =
    "https://uploads-ssl.webflow.com/60523cba14ff1807fd1464d1/65064d348f51eebec1633558_hero%20demo%202-transcode.mp4";
  const videoWebm =
    "https://uploads-ssl.webflow.com/60523cba14ff1807fd1464d1/65064d348f51eebec1633558_hero%20demo%202-transcode.webm";

  return (
    <div className="relative overflow-hidden">
      {/* Text Layer */}
      <section className="relative z-10 py-20 px-4 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* “digital design & Web” */}
          <div>
            <h1 className="font-futura text-5xl md:text-6xl uppercase">
              digital design
            </h1>
            {/* Mobile video preview */}
            <div className="block md:hidden mt-4">
              <video
                autoPlay
                loop
                muted
                playsInline
                poster={posterUrl}
                className="w-full h-auto object-cover rounded-lg"
              >
                <source src={videoMp4} type="video/mp4" />
                <source src={videoWebm} type="video/webm" />
              </video>
            </div>
            <h1 className="font-futura text-5xl md:text-6xl uppercase mt-2">
              &amp; Web
            </h1>
          </div>

          {/* “Agency” + tagline items */}
          <div className="space-y-4">
            <h1 className="font-futura text-5xl md:text-6xl uppercase">
              Agency
            </h1>
            <div className="flex flex-wrap justify-center gap-4 font-real-text text-lg">
              <span>LOGOS</span>
              <span>PHOTO&nbsp;&amp;&nbsp;VIDEO</span>
              <span>WEBSITES</span>
              <span>and MORE</span>
            </div>
          </div>
        </div>
      </section>

      {/* Background video on desktop */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={posterUrl}
        className="hidden md:block absolute inset-0 w-full h-full object-cover opacity-50"
      >
        <source src={videoMp4} type="video/mp4" />
        <source src={videoWebm} type="video/webm" />
      </video>
    </div>
  );
}

<div className="bg-yellow text-font-primary p-4">THIS SHOULD BE YELLOW</div>
