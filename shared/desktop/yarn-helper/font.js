// @flow
/* eslint-disable sort-keys */
import fs from 'fs'
import path from 'path'
import {execSync} from 'child_process'
import prettier from 'prettier'
import webfontsGenerator from 'webfonts-generator'

const commands = {
  'updated-fonts': {
    code: updatedFonts,
    help: 'Update our font sizes automatically',
  },
  'unused-assets': {
    code: unusedAssetes,
    help: 'Find unused assets',
  },
}

const paths = {
  iconfont: path.resolve(__dirname, '../../images/iconfont'),
  iconpng: path.resolve(__dirname, '../../images/icons'),
  font: path.resolve(__dirname, '../../fonts'),
  iconConstants: path.resolve(__dirname, '../../common-adapters/icon.constants.js'),
}

const baseCharCode = 0xe900
const iconfontRegex = /^(\d+)-kb-iconfont-(.*)-(\d+).svg$/
const getSvgFiles = () =>
  fs
    .readdirSync(paths.iconfont)
    .filter(i => i.match(iconfontRegex))
    .map(i => path.resolve(paths.iconfont, i))

/*
 * This function will read all of the SVG files specified above, and generate a single ttf iconfont from the svgs.
 * webfonts-generator will write the file to `dest`
 *
 * For config options: https://github.com/sunflowerdeath/webfonts-generator
 */
function updatedFonts() {
  console.log('Created new webfont')
  webfontsGenerator(
    {
      // An intermediate svgfont will be generated and then converted to TTF by webfonts-generator
      types: ['ttf'],
      files: getSvgFiles(),
      dest: paths.font,
      startCodepoint: baseCharCode,
      fontName: 'kb',
      css: false,
      html: false,
      formatOptions: {
        ttf: {
          ts: Date.now(),
        },
        svg: {
          center: true,
          normalize: true,
          fontHeight: 1024,
        },
      },
    },
    error => (error ? fontsGeneratedError(error) : fontsGeneratedSuccess())
  )
}

function fontsGeneratedSuccess() {
  console.log('Webfont generated successfully... updating constants and flow types')
  // Webfonts generator seems always produce an svg fontfile regardless of the `type` option set above.
  const svgFont = path.resolve(paths.font, 'kb.svg')
  if (fs.existsSync(svgFont)) {
    fs.unlinkSync(svgFont)
  }
  updateConstants()
}

function fontsGeneratedError(error) {
  throw new Error(
    `webfonts-generator failed to generate ttf iconfont file. Check that all svgs exist and the destination directory exits. ${error}`
  )
}

function updateConstants() {
  console.log('Generating icon constants')

  const icons = {}

  // Build constants for the png assests.
  fs
    .readdirSync(paths.iconpng)
    .filter(i => i.indexOf('@') === -1 && i.startsWith('icon-'))
    .forEach(i => {
      const shortName = i.slice(0, -4)
      icons[shortName] = {
        extension: i.slice(-3),
        isFont: false,
        require: `'../images/icons/${i}'`,
      }
    })

  // Build constants for iconfont svgs
  fs.readdirSync(paths.iconfont).forEach(path => {
    const match = path.match(iconfontRegex)
    if (!match || match.length !== 4) return

    const index = Number(match[1])
    const name = match[2]
    const size = match[3]

    icons[`iconfont-${name}`] = {
      isFont: true,
      gridSize: size,
      charCode: baseCharCode + index,
    }
  })

  const iconConstants = `// @flow
  // This file is GENERATED by yarn run updated-fonts. DON'T hand edit
  /* eslint-disable prettier/prettier */

  type IconMeta = {
    isFont: boolean,
    gridSize?: number,
    extension?: string,
    charCode?: number,
    require?: any,
  }

  const iconMeta_ = {
  ${
    /* eslint-disable */
    Object.keys(icons)
      .map(name => {
        const icon = icons[name]
        const meta = [`isFont: ${icon.isFont},`]
        if (icon.gridSize) {
          meta.push(`gridSize: ${icons[name].gridSize},`)
        }
        if (icon.extension) {
          meta.push(`extension: '${icons[name].extension}',`)
        }
        if (icon.charCode) {
          meta.push(`charCode: 0x${icons[name].charCode.toString(16)},`)
        }
        if (icon.require) {
          meta.push(`require: require(${icons[name].require}),`)
        }

        return `'${name}': {
      ${meta.join('\n')}
    },`
      })
      .join('\n')
  }/* eslint-enable */
  }

  export type IconType = $Keys<typeof iconMeta_>
  export const iconMeta: {[key: IconType]: IconMeta} = iconMeta_
  `

  fs.writeFileSync(
    paths.iconConstants,
    // $FlowIssue
    prettier.format(iconConstants, prettier.resolveConfig.sync(paths.iconConstants)),
    'utf8'
  )
}
function unusedAssetes() {
  const allFiles = fs.readdirSync(paths.iconpng)

  // map of root name => [files]
  const images = {}
  allFiles.forEach(f => {
    const parsed = path.parse(f)
    if (!['.jpg', '.png'].includes(parsed.ext)) {
      return
    }

    let root = parsed.name
    const atFiles = root.match(/(.*)@[23]x$/)
    if (atFiles) {
      root = atFiles[1]
    }

    if (!images[root]) {
      images[root] = []
    }
    images[root].push(f)
  })

  Object.keys(images).forEach(image => {
    const command = `ag --ignore "./common-adapters/icon.constants.js" "${image}"`
    try {
      execSync(command, {encoding: 'utf8', env: process.env})
    } catch (e) {
      if (e.status === 1) {
        console.log(images[image].join('\n'))
      }
    }
  })
}

export default commands
