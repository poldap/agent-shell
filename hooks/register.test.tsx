import { test, expect } from 'claude-code/testing'

test('a Bash call becomes a box that opens to its full output', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: 'a\nb\nc', stderr: '', interrupted: false },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>fallback</Text>
  })
  await $.tool.call({ tool: 'Bash', command: 'echo hello', tool_use_id: 't1' } as never)

  const ui = await $.ui.mount({
    plugin: 'agent-shell',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'agent-shell',
    props: {} as never,
  })
  expect(await ui.find({ type: 'Button', text: /echo hello/ })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'toggle-t1' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})
