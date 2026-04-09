import { formatLoom } from './formatter.js'

export const languages = [
  {
    name: 'Loom',
    parsers: ['loom'],
    extensions: ['.loom'],
  },
]

export const parsers = {
  loom: {
    astFormat: 'loom',
    parse: (text: string) => ({ type: 'loom-document', body: text }),
    locStart: () => 0,
    locEnd: (node: any) => node.body.length,
  },
}

export const printers = {
  loom: {
    print(path: any) {
      return formatLoom(path.getValue().body)
    },
  },
}
