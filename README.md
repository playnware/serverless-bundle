# serverless-bundle Fork

> Redirect to [Serverless Bundle](https://github.com/AnomalyInnovations/serverless-bundle) for project info

---

## Description

With this fork we are looking to adapt Serverless Bundle to Cloudware Serverless project structure.

### Changelog

- Removed automatic linting 
- Added lib alias in Webpack config
```
    alias: {
      lib: path.resolve(__dirname, 'lib'),
    }
```
- Added Typescript support by forking the Beta branch
