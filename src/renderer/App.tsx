import type { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import SetupGate from './components/SetupGate';
import MainView from './components/MainView';

const App: FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['setupState'],
    queryFn: () => window.findias.getSetupState(),
  });

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Stack sx={{ alignItems: 'center', py: 6 }}>
          <CircularProgress />
        </Stack>
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="error">Failed to read application state.</Alert>
      </Container>
    );
  }

  return data.valid ? <MainView setup={data} /> : <SetupGate />;
};

export default App;
