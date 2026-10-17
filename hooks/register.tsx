import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ShellEntry } from '../types'

const PANE = 'agent-shell'
const entries = atom({ plugin: 'agent-shell', key: 'entries' } as const, [])

const MAX_ENTRIES = 500

// What a terminal shows before the output: the command after a prompt.
const prompted = (command: string) =>
  command
    .split('\n')
    .map((line, i) => (i === 0 ? `$ ${line}` : `> ${line}`))
    .join('\n')

// A title when the call gave no description: the first real command, minus leading VAR=value prefixes.
const ASSIGNMENT = /^[A-Za-z_]\w*=("[^"]*"|'[^']*'|\S*)\s*(;|&&)?\s*/
const titleOf = (command: string, description?: string) => {
  const given = description?.trim()
  if (given) return given
  for (const line of command.split('\n')) {
    let rest = line.trim()
    while (ASSIGNMENT.test(rest)) rest = rest.replace(ASSIGNMENT, '')
    if (rest !== '' && !rest.startsWith('#') && !/^cd\s/.test(rest)) return rest.slice(0, 60)
  }
  return command.trim().slice(0, 60)
}

// Entries saved before `isDescribed` existed: a title that is a piece of the command was derived, not given.
const shownTitle = (one: ShellEntry) =>
  (one.isDescribed ?? (one.title !== undefined && !one.command.includes(one.title)))
    ? one.title
    : titleOf(one.command)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-shell',
      description: 'Show the shell commands every agent runs, as terminal boxes',
    })
    void $.ui.open({ id: PANE, title: 'Agent shell' })

    return next(e)
  })

  on('command.run', { command: 'agent-shell' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agent shell' })

    return { text: 'Agent shell pane opened.' }
  })

  // Every model call gets the instruction, subagents' included: the box title is the description.
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)

    return {
      sections: [
        ...sections,
        {
          id: 'agent-shell:titles',
          scope: 'session' as const,
          text: 'Every Bash call must set the `description` parameter to a very short title (2-6 words, imperative, e.g. "List dragon folder", "Run host tests") saying what the command does. It is shown as the heading of the command in the user\'s Agent shell pane. Never leave it out, however simple the command.',
        },
      ],
    }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    let agent = 'main'
    if (e.agentId) {
      const found = (await $.agent.list()).find(a => a.id === e.agentId)
      agent = found?.name ?? found?.type ?? e.agentId.slice(0, 8)
    }
    const entry: ShellEntry = {
      id: e.tool_use_id,
      agent,
      title: titleOf(e.command, e.description),
      isDescribed: Boolean(e.description?.trim()),
      command: e.command,
      output: '',
      isDone: false,
      isError: false,
      isOpen: false,
    }
    await update($, entries, list => [...list, entry].slice(-MAX_ENTRIES))

    const ran = await next(e)

    const output =
      ran.deny !== undefined
        ? `denied: ${ran.deny}`
        : ran.result && typeof ran.result === 'object' && 'stdout' in ran.result
          ? [ran.result.stdout, ran.result.stderr].filter(Boolean).join('\n')
          : (ran.text ?? '')
    await update($, entries, list =>
      list.map(one =>
        one.id === entry.id
          ? {
              ...one,
              output: output.replace(/\s+$/, ''),
              isDone: true,
              isError: ran.deny !== undefined || ran.isError === true,
            }
          : one,
      ),
    )

    return ran
  }).catch(($, e, next) => next(e))

  // Under each Bash row in the conversation: a button that opens that command's box.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (e.tool !== 'Bash') return row
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {row}
        <Button
          key={`open-${e.tool_use_id}`}
          dimColor
          onPress={async () => {
            await update($, entries, list =>
              list.map(one => (one.id === e.tool_use_id ? { ...one, isOpen: true } : one)),
            )
            await $.ui.open({ id: PANE, title: 'Agent shell' })
          }}
        >
          ▸ open in Agent shell
        </Button>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const list = await read($, entries)

    const toggle = (id: string) =>
      update($, entries, all =>
        all.map(one => (one.id === id ? { ...one, isOpen: !one.isOpen } : one)),
      )

    return (
      <Box flexDirection="column" gap={1}>
        {list.length === 0 && <Text dimColor>No shell commands yet.</Text>}
        {list.map(one => (
          <Box
            key={`box-${one.id}`}
            flexDirection="column"
            borderStyle="round"
            borderColor={one.isError ? 'red' : undefined}
            paddingX={1}
          >
            <Box flexDirection="row" gap={1}>
              <Button
                key={`toggle-${one.id}`}
                plain
                label={`${one.isOpen ? '▾' : '▸'} ${shownTitle(one)}`}
                onPress={() => toggle(one.id)}
              />
              <Text dimColor>
                {one.agent}
                {one.isDone ? (one.isError ? ' · failed' : '') : ' · running…'}
              </Text>
            </Box>
            {one.isOpen && (
              <Box backgroundColor="#111111" paddingX={1} marginTop={1} flexDirection="column">
                <Code source={prompted(one.command)} language="bash" />
                {one.output !== '' && <Code source={one.output} />}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}
