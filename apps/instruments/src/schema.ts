/**
 * A thoremin-derived settings surface, modeled as a zodal-dials definition. Flat dotted keyspace
 * (master / two voices / face / overlay), grouped by facet, with a cross-field constraint and a soft
 * warning — a faithful slice of thoremin's real `SettingsSchema`, enough to render a rich panel and
 * save/load as named "instruments".
 */

import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';

const INSTRUMENTS = ['sine', 'triangle', 'sawtooth', 'square', 'pluck', 'bell', 'organ', 'pad'] as const;
const SCALES = ['major', 'minor', 'pentatonic', 'blues', 'chromatic', 'dorian', 'mixolydian'] as const;
const SEVEN_NOTE = new Set(['major', 'minor', 'chromatic', 'dorian', 'mixolydian']);
const FACE_MAPPING = ['none', 'timbre', 'chord'] as const;

export const thoreminDials = defineDials(
  z.object({
    'master.volume': z.number().min(0).max(1).default(0.8).meta({ facets: ['Master'], title: 'Master volume', description: 'Overall output level' }),
    'master.syncHands': z.boolean().default(false).meta({ facets: ['Master'], title: 'Sync hands', description: 'Mirror the right hand to the left' }),

    'voice.right.instrument': z.enum(INSTRUMENTS).default('sine').meta({ facets: ['Right voice'], title: 'Instrument' }),
    'voice.right.scale': z.enum(SCALES).default('major').meta({ facets: ['Right voice'], title: 'Scale' }),
    'voice.right.octaves': z.number().int().min(1).max(4).default(2).meta({ facets: ['Right voice'], title: 'Octaves' }),
    'voice.right.baseOctave': z.number().int().min(1).max(7).default(4).meta({ facets: ['Right voice', 'advanced'], title: 'Base octave' }),

    'voice.left.instrument': z.enum(INSTRUMENTS).default('pad').meta({ facets: ['Left voice'], title: 'Instrument' }),
    'voice.left.scale': z.enum(SCALES).default('major').meta({ facets: ['Left voice'], title: 'Scale' }),
    'voice.left.octaves': z.number().int().min(1).max(4).default(2).meta({ facets: ['Left voice'], title: 'Octaves' }),

    'face.mapping': z.enum(FACE_MAPPING).default('none').meta({ facets: ['Face'], title: 'Face mapping', description: 'How facial expression drives the sound' }),
    'face.chordBpm': z.number().int().min(40).max(200).default(90).meta({ facets: ['Face'], title: 'Chord tempo (BPM)' }),

    'overlay.showSkeleton': z.boolean().default(true).meta({ facets: ['Overlay'], title: 'Show hand skeleton' }),
    'overlay.showVideo': z.boolean().default(true).meta({ facets: ['Overlay'], title: 'Show video' }),
    'overlay.videoOpacity': z.number().min(0).max(1).default(0.5).meta({ facets: ['Overlay'], title: 'Video opacity' }),
  }),
  {
    constraints: {
      assertions: [
        {
          message: 'Chord face-mapping needs a 7-note scale (not pentatonic/blues)',
          keys: ['face.mapping', 'voice.right.scale'],
          check: (v) => v['face.mapping'] !== 'chord' || SEVEN_NOTE.has(v['voice.right.scale'] as string),
        },
      ],
      warnings: [
        { message: 'Four octaves on the right voice can sound shrill', when: (v) => (v['voice.right.octaves'] as number) >= 4 },
      ],
    },
  },
);
