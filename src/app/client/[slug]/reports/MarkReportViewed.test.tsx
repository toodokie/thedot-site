import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkReportViewed from './MarkReportViewed'
import { markReportViewed } from './report-view-actions'

vi.mock('./report-view-actions', () => ({ markReportViewed: vi.fn() }))

describe('MarkReportViewed', () => {
  beforeEach(() => vi.mocked(markReportViewed).mockReset())

  it('records the signed-in seat only after the report mounts', async () => {
    render(<MarkReportViewed slug="kanset" reportKey="2026-07" />)

    await waitFor(() => {
      expect(markReportViewed).toHaveBeenCalledOnce()
      expect(markReportViewed).toHaveBeenCalledWith('kanset', '2026-07')
    })
  })
})
