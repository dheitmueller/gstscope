export const SAMPLE_CATALOG = [
  {
    id: 'gps-filesrc-video-audio', label: 'MP4 audio + video', file: 'gps-filesrc-video-audio.dot',
    author: 'Stéphane Cerveau and GstPipelineStudio contributors',
    source: 'https://gitlab.freedesktop.org/dabrain34/GstPipelineStudio/-/blob/056bea68fc5397b9355611af718e407573d624af/data/dots/gst126_filesrc_video_audio.dot',
    license: 'GPL-3.0-or-later — unmodified upstream capture',
    description: 'A real GStreamer 1.26 runtime capture with audio and video branches, parsebin, queues, decoders, converters, and nested automatic sink bins.'
  },
  {
    id: 'gps-big-buck-bunny', label: 'Big Buck Bunny', file: 'gps-big-buck-bunny.dot',
    author: 'Stéphane Cerveau and GstPipelineStudio contributors',
    source: 'https://gitlab.freedesktop.org/dabrain34/GstPipelineStudio/-/blob/056bea68fc5397b9355611af718e407573d624af/data/dots/gst126_filesrc_bbb_tooltip.dot',
    license: 'GPL-3.0-or-later — unmodified upstream capture',
    description: 'A real GStreamer 1.26 Big Buck Bunny playback capture with demuxing, parsebin internals, H.264 decoding, conversion, and an automatic video sink bin.'
  },
  {
    id: 'gps-jellyfish', label: 'Jellyfish H.264', file: 'gps-jellyfish.dot',
    author: 'Stéphane Cerveau and GstPipelineStudio contributors',
    source: 'https://gitlab.freedesktop.org/dabrain34/GstPipelineStudio/-/blob/056bea68fc5397b9355611af718e407573d624af/data/dots/gst126_filesrc_jelly_tooltip.dot',
    license: 'GPL-3.0-or-later — unmodified upstream capture',
    description: 'A real GStreamer 1.26 H.264 playback capture with typefinding, demuxing, parsing, decoding, conversion, and an automatic video sink bin.'
  },
  {
    id: 'playback-bins', label: 'Playback with nested bins', file: 'playback-bins.dot',
    author: 'GstScope contributors; based on GStreamer playback and bin documentation',
    source: 'https://gstreamer.freedesktop.org/documentation/application-development/basics/bins.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'A bin-rich playback topology with separate decode, audio-output, and video-output containers.'
  },
  {
    id: 'capture-record-bins', label: 'Capture and record bins', file: 'capture-record-bins.dot',
    author: 'GstScope contributors; based on GStreamer Project examples',
    source: 'https://gstreamer.freedesktop.org/documentation/tools/gst-launch.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'Independent audio and video capture bins feeding a shared Matroska recording path.'
  },
  {
    id: 'video-test', label: 'Video test pattern', file: 'video-test.dot',
    author: 'GstScope contributors; based on the GStreamer Project example',
    source: 'https://gstreamer.freedesktop.org/documentation/tools/gst-launch.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'A minimal raw-video pipeline based on the diagnostic gst-launch example.'
  },
  {
    id: 'audio-test', label: 'Audio test tone', file: 'audio-test.dot',
    author: 'GstScope contributors; based on the GStreamer Project example',
    source: 'https://gstreamer.freedesktop.org/documentation/tools/gst-launch.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'A sine-wave source passing through conversion and resampling to an automatic audio sink.'
  },
  {
    id: 'tee-visualization', label: 'Tee: audio + visualization', file: 'tee-visualization.dot',
    author: 'GstScope contributors; topology by Erik Walthinsen and Wim Taymans',
    source: 'https://gstreamer.freedesktop.org/documentation/coreelements/tee.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'The documented tee example with independently queued audio playback and visualization branches.'
  },
  {
    id: 'compositor', label: 'Two-source compositor', file: 'compositor.dot',
    author: 'GstScope contributors; topology by Wim Taymans and Sebastian Dröge',
    source: 'https://gstreamer.freedesktop.org/documentation/compositor/',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'Two video test sources with different caps feeding a compositor and display sink.'
  },
  {
    id: 'appsrc-appsink', label: 'Application source and sink', file: 'appsrc-appsink.dot',
    author: 'GstScope contributors; based on work by David Schleef and Wim Taymans',
    source: 'https://gstreamer.freedesktop.org/documentation/tutorials/basic/short-cutting-the-pipeline.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'Application-provided audio flowing through a queue and converters into an application sink.'
  },
  {
    id: 'uridecodebin-av', label: 'URI decode: audio + video', file: 'uridecodebin-av.dot',
    author: 'GstScope contributors; based on the GStreamer Project playback guidance',
    source: 'https://gstreamer.freedesktop.org/documentation/playback/uridecodebin.html',
    license: 'Generated fixture — GPL-2.0-or-later',
    description: 'A dynamic URI decoder feeding independent converted audio and video output branches.'
  },
  {
    id: 'stress', label: 'Synthetic 280-node stress test', generated: true,
    author: 'GstScope contributors',
    source: 'https://github.com/dheitmueller/gstscope',
    license: 'GPL-2.0-or-later',
    description: 'A generated large graph for performance and layout regression testing.'
  }
];
