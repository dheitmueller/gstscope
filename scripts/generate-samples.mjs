import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('src/samples');

const samples = [
  {
    file: 'audio-test.dot', name: 'audio-test',
    elements: [
      ['audiotestsrc0', 'GstAudioTestSrc', [], ['src']],
      ['audioconvert0', 'GstAudioConvert', ['sink'], ['src']],
      ['audioresample0', 'GstAudioResample', ['sink'], ['src']],
      ['autoaudiosink0', 'GstAutoAudioSink', ['sink'], []]
    ],
    edges: [['audiotestsrc0', 'src', 'audioconvert0', 'sink', 'audio/x-raw'], ['audioconvert0', 'src', 'audioresample0', 'sink', 'audio/x-raw'], ['audioresample0', 'src', 'autoaudiosink0', 'sink', 'audio/x-raw']]
  },
  {
    file: 'video-test.dot', name: 'video-test',
    elements: [
      ['videotestsrc0', 'GstVideoTestSrc', [], ['src']],
      ['videoconvert0', 'GstVideoConvert', ['sink'], ['src']],
      ['autovideosink0', 'GstAutoVideoSink', ['sink'], []]
    ],
    edges: [['videotestsrc0', 'src', 'videoconvert0', 'sink', 'video/x-raw'], ['videoconvert0', 'src', 'autovideosink0', 'sink', 'video/x-raw']]
  },
  {
    file: 'tee-visualization.dot', name: 'tee-visualization',
    elements: [
      ['filesrc0', 'GstFileSrc', [], ['src']], ['decodebin0', 'GstDecodeBin', ['sink'], ['src']],
      ['tee0', 'GstTee', ['sink'], ['src_0', 'src_1']], ['queue0', 'GstQueue', ['sink'], ['src']],
      ['audioconvert0', 'GstAudioConvert', ['sink'], ['src']], ['audioresample0', 'GstAudioResample', ['sink'], ['src']],
      ['autoaudiosink0', 'GstAutoAudioSink', ['sink'], []], ['queue1', 'GstQueue', ['sink'], ['src']],
      ['audioconvert1', 'GstAudioConvert', ['sink'], ['src']], ['goom0', 'GstGoom', ['sink'], ['src']],
      ['videoconvert0', 'GstVideoConvert', ['sink'], ['src']], ['autovideosink0', 'GstAutoVideoSink', ['sink'], []]
    ],
    edges: [
      ['filesrc0','src','decodebin0','sink','ANY'], ['decodebin0','src','tee0','sink','audio/x-raw'],
      ['tee0','src_0','queue0','sink','audio/x-raw'], ['queue0','src','audioconvert0','sink','audio/x-raw'],
      ['audioconvert0','src','audioresample0','sink','audio/x-raw'], ['audioresample0','src','autoaudiosink0','sink','audio/x-raw'],
      ['tee0','src_1','queue1','sink','audio/x-raw'], ['queue1','src','audioconvert1','sink','audio/x-raw'],
      ['audioconvert1','src','goom0','sink','audio/x-raw'], ['goom0','src','videoconvert0','sink','video/x-raw'],
      ['videoconvert0','src','autovideosink0','sink','video/x-raw']
    ]
  },
  {
    file: 'compositor.dot', name: 'compositor-demo',
    elements: [
      ['videotestsrc0','GstVideoTestSrc',[],['src']], ['capsfilter0','GstCapsFilter',['sink'],['src']],
      ['videobox0','GstVideoBox',['sink'],['src']], ['videotestsrc1','GstVideoTestSrc',[],['src']],
      ['capsfilter1','GstCapsFilter',['sink'],['src']], ['compositor0','GstCompositor',['sink_0','sink_1'],['src']],
      ['videoconvert0','GstVideoConvert',['sink'],['src']], ['xvimagesink0','GstXvImageSink',['sink'],[]]
    ],
    edges: [
      ['videotestsrc0','src','capsfilter0','sink','video/x-raw\l width: 100\l height: 100\l framerate: 10/1'],
      ['capsfilter0','src','videobox0','sink','video/x-raw'], ['videobox0','src','compositor0','sink_0','video/x-raw'],
      ['videotestsrc1','src','capsfilter1','sink','video/x-raw\l width: 320\l height: 240\l framerate: 5/1'],
      ['capsfilter1','src','compositor0','sink_1','video/x-raw'], ['compositor0','src','videoconvert0','sink','video/x-raw'],
      ['videoconvert0','src','xvimagesink0','sink','video/x-raw']
    ]
  },
  {
    file: 'rtp-h264-receiver.dot', name: 'rtp-h264-receiver',
    elements: [
      ['udpsrc0','GstUDPSrc',[],['src']], ['rtpjitterbuffer0','GstRtpJitterBuffer',['sink'],['src']],
      ['rtph264depay0','GstRtpH264Depay',['sink'],['src']], ['h264parse0','GstH264Parse',['sink'],['src']],
      ['avdec_h264_0','GstAvdecH264',['sink'],['src']], ['videoconvert0','GstVideoConvert',['sink'],['src']],
      ['xvimagesink0','GstXvImageSink',['sink'],[]]
    ],
    edges: chain(['udpsrc0','rtpjitterbuffer0','rtph264depay0','h264parse0','avdec_h264_0','videoconvert0','xvimagesink0'], ['application/x-rtp','application/x-rtp','video/x-h264','video/x-h264','video/x-raw','video/x-raw'])
  },
  {
    file: 'rtp-h264-transmitter.dot', name: 'rtp-h264-transmitter',
    elements: [
      ['v4l2src0','GstV4l2Src',[],['src']], ['queue0','GstQueue',['sink'],['src']], ['videoconvert0','GstVideoConvert',['sink'],['src']],
      ['x264enc0','GstX264Enc',['sink'],['src']], ['capsfilter0','GstCapsFilter',['sink'],['src']],
      ['rtph264pay0','GstRtpH264Pay',['sink'],['src']], ['udpsink0','GstUDPSink',['sink'],[]]
    ],
    edges: chain(['v4l2src0','queue0','videoconvert0','x264enc0','capsfilter0','rtph264pay0','udpsink0'], ['video/x-raw','video/x-raw','video/x-raw','video/x-h264','video/x-h264','application/x-rtp'])
  },
  {
    file: 'appsrc-appsink.dot', name: 'appsrc-appsink',
    elements: [
      ['appsrc0','GstAppSrc',[],['src']], ['queue0','GstQueue',['sink'],['src']],
      ['audioconvert0','GstAudioConvert',['sink'],['src']], ['audioresample0','GstAudioResample',['sink'],['src']],
      ['appsink0','GstAppSink',['sink'],[]]
    ],
    edges: chain(['appsrc0','queue0','audioconvert0','audioresample0','appsink0'], ['audio/x-raw','audio/x-raw','audio/x-raw','audio/x-raw'])
  },
  {
    file: 'rist-record.dot', name: 'rist-record',
    elements: [
      ['ristsrc0','GstRistSrc',[],['src']], ['rtph264depay0','GstRtpH264Depay',['sink'],['src']],
      ['h264parse0','GstH264Parse',['sink'],['src']], ['matroskamux0','GstMatroskaMux',['video_0'],['src']],
      ['filesink0','GstFileSink',['sink'],[]]
    ],
    edges: [
      ['ristsrc0','src','rtph264depay0','sink','application/x-rtp'], ['rtph264depay0','src','h264parse0','sink','video/x-h264'],
      ['h264parse0','src','matroskamux0','video_0','video/x-h264'], ['matroskamux0','src','filesink0','sink','video/x-matroska']
    ]
  },
  {
    file: 'uridecodebin-av.dot', name: 'uridecodebin-av',
    elements: [
      ['uridecodebin0','GstURIDecodeBin',[],['audio_0','video_0']],
      ['audioconvert0','GstAudioConvert',['sink'],['src']], ['audioresample0','GstAudioResample',['sink'],['src']],
      ['autoaudiosink0','GstAutoAudioSink',['sink'],[]], ['videoconvert0','GstVideoConvert',['sink'],['src']],
      ['videoscale0','GstVideoScale',['sink'],['src']], ['autovideosink0','GstAutoVideoSink',['sink'],[]]
    ],
    edges: [
      ['uridecodebin0','audio_0','audioconvert0','sink','audio/x-raw'], ['audioconvert0','src','audioresample0','sink','audio/x-raw'],
      ['audioresample0','src','autoaudiosink0','sink','audio/x-raw'], ['uridecodebin0','video_0','videoconvert0','sink','video/x-raw'],
      ['videoconvert0','src','videoscale0','sink','video/x-raw'], ['videoscale0','src','autovideosink0','sink','video/x-raw']
    ]
  }
];

function chain(ids, caps) {
  return ids.slice(0, -1).map((id, index) => [id, 'src', ids[index + 1], 'sink', caps[index]]);
}

function nodeId(element, pad) {
  return `${element}_${pad}`;
}

function render(sample) {
  const out = [
    'digraph pipeline {', '  rankdir=LR;', '  fontname="sans";', '  fontsize="10";', '  labelloc=t;',
    `  label="<GstPipeline>\\n${sample.name}\\n[>]";`,
    '  node [style="filled,rounded", shape=box, fontsize="9", fontname="sans", margin="0.0,0.0"];',
    '  edge [labelfontsize="6", fontsize="9", fontname="monospace"];'
  ];
  sample.elements.forEach(([id, factory, sinks, sources], index) => {
    out.push(`  subgraph cluster_${id}_${index} {`, `    label="${factory}\\n${id}\\n[>]";`, '    style="filled,rounded";', '    color=black;', '    fillcolor="#ffffff";');
    if (sinks.length) {
      out.push(`    subgraph cluster_${id}_sink {`, '      label="";', '      style="invis";');
      sinks.forEach(pad => out.push(`      ${nodeId(id, pad)} [color=black, fillcolor="#aaaaff", label="${pad}\\n[>][bfb]", height="0.2", style="filled,solid"];`));
      out.push('    }');
    }
    if (sources.length) {
      out.push(`    subgraph cluster_${id}_src {`, '      label="";', '      style="invis";');
      sources.forEach(pad => out.push(`      ${nodeId(id, pad)} [color=black, fillcolor="#ffaaaa", label="${pad}\\n[>][bfb]", height="0.2", style="filled,solid"];`));
      out.push('    }');
    }
    if (sinks.length && sources.length) out.push(`    ${nodeId(id, sinks[0])} -> ${nodeId(id, sources[0])} [style="invis"];`);
    out.push('  }');
  });
  sample.edges.forEach(([source, sourcePad, target, targetPad, caps]) => {
    out.push(`  ${nodeId(source, sourcePad)} -> ${nodeId(target, targetPad)} [label="${caps || 'ANY'}"];`);
  });
  out.push('}', '');
  return out.join('\n');
}

await mkdir(output, { recursive: true });
await Promise.all(samples.map(sample => writeFile(resolve(output, sample.file), render(sample))));
console.log(`Generated ${samples.length} attributed GStreamer DOT samples`);
