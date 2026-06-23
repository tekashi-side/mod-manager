import type { FC } from 'react'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import type { SetupState } from '@shared/api'

type MainViewProps = {
  setup: SetupState
}

const MainView: FC<MainViewProps> = ({ setup }) => {
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h4">Findias</Typography>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="success.main">
              Game folder ready
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
              {setup.gameRootPath}
            </Typography>
          </Stack>
        </Paper>

        <Typography variant="body2" color="text.secondary">
          The mod list will appear here next (Phases 2 &amp; 3).
        </Typography>
      </Stack>
    </Container>
  )
}

export default MainView
