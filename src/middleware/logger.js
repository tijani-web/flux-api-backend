import colors from 'colors';

const logger = (req, res, next) => {
  const methodColors = {
    GET: 'green',
    POST: 'blue', 
    PUT: 'yellow',
    DELETE: 'red',
    PATCH: 'magenta'
  };

  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const methodColor = methodColors[req.method] || 'white';
    const statusColor = res.statusCode >= 400 ? 'red' : 'green';
    
    console.log(
      `${req.method}`[methodColor],
      `${req.originalUrl}`.white,
      `${res.statusCode}`[statusColor],
      `${duration}ms`[duration > 1000 ? 'red' : 'gray']
    );
  });

  next();
};

export default logger;